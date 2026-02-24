# Recommendation Engine — Technical Design Document

**Project:** Operation Moonshot
**Author:** Developer Agent
**Date:** 2026-02-23
**Status:** Draft v1.0
**Task:** task_1771791000010

---

## 1. Executive Summary

This document defines the architecture for a content recommendation engine that learns user preferences and surfaces relevant content. The system uses a **hybrid approach** (collaborative filtering + content-based filtering) with a **batch-first, real-time-augmented** processing model. Designed to start simple and scale incrementally.

---

## 2. Input Signals

User behavior is captured through **implicit** and **explicit** signals. Implicit signals are higher volume and more reliable at scale; explicit signals are stronger per-event but sparser.

### 2.1 Implicit Signals

| Signal | Weight | Description | Collection Method |
|--------|--------|-------------|-------------------|
| **Click** | 1.0 | User clicks on content item | Client event |
| **Dwell time** | 0.5–3.0 (scaled) | Time spent viewing content (>10s = meaningful) | Client heartbeat (5s intervals) |
| **Scroll depth** | 0.5–2.0 (scaled) | How far user scrolled (25/50/75/100%) | Intersection Observer |
| **Save/bookmark** | 4.0 | User explicitly saves content | Client event |
| **Share** | 5.0 | User shares content externally | Client event |
| **Return visit** | 3.0 | User revisits same content within 7 days | Server-side join |
| **Skip/bounce** | -1.0 | Click + dwell <3s = negative signal | Computed server-side |
| **Hide/dismiss** | -3.0 | User explicitly hides a recommendation | Client event |

### 2.2 Explicit Signals

| Signal | Weight | Description |
|--------|--------|-------------|
| **Like/upvote** | 4.0 | Direct positive feedback |
| **Dislike/downvote** | -4.0 | Direct negative feedback |
| **Rating (1-5)** | mapped to -4 to +5 | Numeric quality rating |
| **Category preference** | N/A | Onboarding selections (cold-start) |

### 2.3 Signal Normalization

Raw signals are normalized into a **preference score** per user-item pair:

```
preference_score = Σ(signal_weight × recency_decay)
recency_decay = e^(-λt)  where t = days since event, λ = 0.05
```

Scores are capped at [-10, +10] and stored as the interaction matrix.

### 2.4 Contextual Signals (Phase 2)

- Time of day (morning vs evening browsing patterns)
- Device type (mobile users prefer shorter content)
- Session depth (recommendations should diversify as session lengthens)

---

## 3. Algorithm Choice: Hybrid Approach

### 3.1 Decision

**Hybrid** — combining collaborative filtering (CF) and content-based filtering (CBF), with rule-based fallbacks for cold-start.

### 3.2 Trade-off Analysis

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Collaborative Filtering (CF)** | Discovers non-obvious connections; no content analysis needed | Cold-start problem; needs critical mass (~1K users); popularity bias | Use for established users |
| **Content-Based (CBF)** | Works with 0 users; explainable; no cold-start for items | Filter bubble; can't find surprising recommendations | Use for cold-start + blending |
| **Hybrid** | Best of both; graceful cold-start handling; diverse results | More complex; two models to maintain | **Selected** |
| **Deep Learning (Neural CF)** | State-of-art accuracy; handles complex patterns | Needs massive data (100K+ interactions); expensive to train/serve; black box | Overkill at our scale |
| **Knowledge Graph** | Highly explainable; rich relationships | Expensive to build and maintain; needs domain expertise | Future consideration |

### 3.3 Hybrid Strategy: Weighted Switching

```
if user.interaction_count < 10:
    score = 0.9 × CBF_score + 0.1 × popularity_score
elif user.interaction_count < 100:
    score = 0.5 × CBF_score + 0.4 × CF_score + 0.1 × popularity_score
else:
    score = 0.3 × CBF_score + 0.6 × CF_score + 0.1 × diversity_boost
```

The weights shift as the system accumulates more user data. This handles the cold-start problem gracefully.

### 3.4 Algorithm Details

#### Content-Based Filtering (CBF)

- **Feature extraction:** TF-IDF on item text (title, description, tags, body). Alternatively, use a pre-trained sentence embedding model (e.g., `all-MiniLM-L6-v2` via ONNX) for 384-dimensional dense vectors.
- **User profile:** Weighted centroid of interacted item vectors, where weights = preference_score.
- **Scoring:** Cosine similarity between user profile vector and candidate item vector.

#### Collaborative Filtering (CF)

- **Method:** Alternating Least Squares (ALS) matrix factorization on the user-item interaction matrix.
- **Dimensions:** 64 latent factors (tunable).
- **Library:** `implicit` (Python) or custom TypeScript implementation using SVD decomposition.
- **Regularization:** λ = 0.1 to prevent overfitting on sparse data.

#### Popularity Baseline

- Exponentially weighted moving average of interaction counts over trailing 7 days.
- Used as fallback and blending signal for all users.

### 3.5 Cold-Start Strategy

| Scenario | Strategy |
|----------|----------|
| **New user, no interactions** | Onboarding quiz (3–5 category selections) → CBF from selected categories + global popular |
| **New user, <10 interactions** | Heavy CBF weight (0.9) + popular items from interacted categories |
| **New item, no interactions** | CBF only — embed item features and match to user profiles |
| **New item, <20 interactions** | Exploration boost: +20% exposure for items with <20 interactions (decays over 7 days) |

---

## 4. Data Pipeline Architecture

### 4.1 Pipeline Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                     │
│                                                                          │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐            │
│   │  Click    │   │  Dwell   │   │  Save/   │   │  Like/   │            │
│   │  Events   │   │  Time    │   │  Share   │   │  Rate    │            │
│   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘            │
│        └───────────────┴──────────────┴──────────────┘                   │
│                         │                                                │
│              ┌──────────▼──────────┐                                     │
│              │  Event Collector    │  Batches events client-side          │
│              │  (client SDK)       │  Flushes every 5s or on navigate    │
│              └──────────┬──────────┘                                     │
└─────────────────────────┼───────────────────────────────────────────────┘
                          │ POST /api/events (batch)
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       INGESTION LAYER                                    │
│                                                                          │
│   ┌──────────────────────┐    ┌──────────────────────┐                  │
│   │  Event API           │───▶│  Event Queue          │                  │
│   │  (validate + enrich) │    │  (in-memory or Redis) │                  │
│   └──────────────────────┘    └──────────┬───────────┘                  │
│                                          │                               │
│                              ┌───────────▼────────────┐                  │
│                              │  Event Writer           │                  │
│                              │  (batch insert to DB)   │                  │
│                              └───────────┬────────────┘                  │
└──────────────────────────────────────────┼──────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       STORAGE LAYER                                      │
│                                                                          │
│   ┌───────────────────┐  ┌───────────────────┐  ┌──────────────────┐   │
│   │  Raw Events       │  │  User Profiles     │  │  Item Features   │   │
│   │  (append-only)    │  │  (aggregated)      │  │  (embeddings)    │   │
│   └───────────────────┘  └───────────────────┘  └──────────────────┘   │
│                                                                          │
│   ┌───────────────────┐  ┌───────────────────┐                          │
│   │  Interaction       │  │  Model Artifacts   │                         │
│   │  Matrix           │  │  (ALS factors)     │                         │
│   └───────────────────┘  └───────────────────┘                          │
└─────────────────────────────────────────────────────────────────────────┘
                                           │
                              ┌────────────┴────────────┐
                              │                         │
                              ▼                         ▼
┌──────────────────────────────────┐  ┌──────────────────────────────────┐
│       BATCH PIPELINE             │  │      REAL-TIME LAYER              │
│       (runs every 6h)            │  │      (per-request)                │
│                                  │  │                                   │
│  1. Aggregate raw events         │  │  1. Fetch user profile vector     │
│     → interaction matrix         │  │  2. Fetch candidate items         │
│  2. Retrain ALS model            │  │  3. Score: CBF + CF + popular     │
│     (64 factors, 15 iters)       │  │  4. Apply diversity filter        │
│  3. Recompute user profiles      │  │  5. Apply business rules          │
│     (weighted centroids)         │  │  6. Return top-N ranked items     │
│  4. Update popularity scores     │  │                                   │
│  5. Export model artifacts       │  │  Latency target: <100ms p95       │
│                                  │  │                                   │
│  Duration target: <30min         │  │                                   │
└──────────────────────────────────┘  └──────────────────────────────────┘
                                                    │
                                                    ▼
                                      ┌──────────────────────────┐
                                      │  Recommendation API       │
                                      │  GET /api/recommendations │
                                      │  ?userId=X&limit=20       │
                                      │  &exclude=seen_ids        │
                                      └──────────────────────────┘
```

### 4.2 Pipeline Stages Detail

| Stage | Input | Output | Frequency | Duration Target |
|-------|-------|--------|-----------|-----------------|
| **Event Collection** | User actions | Batched event payloads | Continuous (5s flush) | <50ms client-side |
| **Event Ingestion** | Event payloads | Raw events in DB | Continuous | <200ms per batch |
| **Interaction Aggregation** | Raw events | User-item preference matrix | Every 6h (batch) | <10min |
| **Model Training** | Interaction matrix + item features | ALS factors + user profiles | Every 6h (batch) | <15min |
| **Recommendation Serving** | User ID + model artifacts | Ranked item list | Per-request (real-time) | <100ms p95 |

---

## 5. Real-Time vs Batch Decision

### 5.1 Decision: Batch-First, Real-Time-Augmented

| Component | Processing Mode | Justification |
|-----------|----------------|---------------|
| **Event collection** | Real-time | Events must be captured immediately |
| **Model training (ALS)** | Batch (every 6h) | ALS retraining is too expensive for real-time; 6h staleness is acceptable |
| **User profile updates** | Near-real-time (every 15min) | Lightweight centroid recalculation; keeps CBF fresh |
| **Recommendation scoring** | Real-time (per-request) | Scoring against pre-computed models is fast (<10ms) |
| **Popularity scores** | Batch (hourly) | Trending doesn't need sub-minute freshness |

### 5.2 Latency Targets

| Operation | Target (p50) | Target (p95) | Target (p99) |
|-----------|-------------|-------------|-------------|
| Event ingestion | 50ms | 200ms | 500ms |
| Get recommendations (warm) | 20ms | 100ms | 250ms |
| Get recommendations (cold user) | 50ms | 150ms | 300ms |
| Batch model retrain | 10min | 20min | 30min |

### 5.3 Why Not Fully Real-Time?

- **ALS matrix factorization** requires full matrix access — not incrementally updatable without approximation (and approximation degrades quality significantly at small data volumes).
- At launch scale (<10K users), 6-hour model staleness is imperceptible to users.
- Real-time serving of pre-computed models gives the *feeling* of real-time personalization at a fraction of the infrastructure cost.
- **Phase 2 upgrade path:** Switch to online learning (e.g., contextual bandits or incremental SVD) once data volume justifies it.

---

## 6. Storage Schema

### 6.1 Raw Events Table

```sql
CREATE TABLE events (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id         VARCHAR(64) NOT NULL,
    item_id         VARCHAR(64) NOT NULL,
    event_type      VARCHAR(32) NOT NULL,  -- 'click', 'dwell', 'save', 'share', 'like', 'dislike', 'rate', 'hide', 'skip'
    event_value     FLOAT,                 -- dwell_seconds, rating_value, scroll_pct, etc.
    session_id      VARCHAR(64),
    device_type     VARCHAR(16),           -- 'desktop', 'mobile', 'tablet'
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_user_time (user_id, created_at),
    INDEX idx_item_time (item_id, created_at),
    INDEX idx_type_time (event_type, created_at)
);
```

### 6.2 User-Item Interactions (Aggregated)

```sql
CREATE TABLE user_item_interactions (
    user_id         VARCHAR(64) NOT NULL,
    item_id         VARCHAR(64) NOT NULL,
    preference_score FLOAT NOT NULL,       -- normalized [-10, +10]
    interaction_count INT NOT NULL DEFAULT 0,
    last_interaction TIMESTAMP NOT NULL,
    first_interaction TIMESTAMP NOT NULL,

    PRIMARY KEY (user_id, item_id),
    INDEX idx_user (user_id),
    INDEX idx_item (item_id)
);
```

### 6.3 User Profiles

```sql
CREATE TABLE user_profiles (
    user_id             VARCHAR(64) PRIMARY KEY,
    profile_vector      BLOB NOT NULL,         -- 384-dim float32 array (CBF profile)
    cf_factors          BLOB,                  -- 64-dim float32 array (ALS user factors)
    interaction_count   INT NOT NULL DEFAULT 0,
    preferred_categories JSON,                 -- top categories by interaction weight
    onboarding_prefs    JSON,                  -- initial category selections
    last_active         TIMESTAMP NOT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 6.4 Item Features

```sql
CREATE TABLE item_features (
    item_id             VARCHAR(64) PRIMARY KEY,
    title               VARCHAR(512) NOT NULL,
    category            VARCHAR(128),
    tags                JSON,                  -- string array
    feature_vector      BLOB NOT NULL,         -- 384-dim float32 (sentence embedding)
    popularity_score    FLOAT DEFAULT 0,       -- EWMA of recent interactions
    interaction_count   INT DEFAULT 0,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 6.5 Model Artifacts

```sql
CREATE TABLE model_artifacts (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    model_type      VARCHAR(32) NOT NULL,    -- 'als', 'popularity', 'embeddings'
    version         INT NOT NULL,
    artifact_path   VARCHAR(512) NOT NULL,   -- path to serialized model file
    metrics         JSON,                    -- training metrics (loss, coverage, etc.)
    item_count      INT,
    user_count      INT,
    trained_at      TIMESTAMP NOT NULL,
    active          BOOLEAN DEFAULT FALSE,   -- is this the serving model?

    INDEX idx_type_active (model_type, active)
);
```

### 6.6 Recommendations Cache

```sql
CREATE TABLE recommendation_cache (
    user_id         VARCHAR(64) NOT NULL,
    item_id         VARCHAR(64) NOT NULL,
    score           FLOAT NOT NULL,
    rank_position   INT NOT NULL,
    model_version   INT NOT NULL,
    generated_at    TIMESTAMP NOT NULL,

    PRIMARY KEY (user_id, rank_position),
    INDEX idx_user_gen (user_id, generated_at)
);
```

### 6.7 Storage Size Estimates (at 10K users)

| Table | Row Size | Rows (est.) | Total Size |
|-------|----------|-------------|------------|
| events | ~120 bytes | 5M/month | ~600MB/month |
| user_item_interactions | ~60 bytes | 500K | ~30MB |
| user_profiles | ~1.7KB | 10K | ~17MB |
| item_features | ~1.7KB | 50K | ~85MB |
| model_artifacts | ~200 bytes | ~100 | <1MB |
| recommendation_cache | ~50 bytes | 200K | ~10MB |

**Total active storage:** ~150MB + 600MB/month event growth.
**Recommendation:** Partition events by month; archive events older than 90 days.

---

## 7. API Endpoints

### 7.1 Event Ingestion

```
POST /api/events
Content-Type: application/json

{
  "events": [
    {
      "userId": "user_123",
      "itemId": "item_456",
      "eventType": "click",
      "eventValue": null,
      "sessionId": "sess_abc",
      "deviceType": "desktop",
      "timestamp": "2026-02-23T05:00:00.000Z"
    },
    {
      "userId": "user_123",
      "itemId": "item_456",
      "eventType": "dwell",
      "eventValue": 45.2,
      "sessionId": "sess_abc",
      "deviceType": "desktop",
      "timestamp": "2026-02-23T05:00:45.000Z"
    }
  ]
}

Response: 202 Accepted
{ "queued": 2 }
```

### 7.2 Get Recommendations

```
GET /api/recommendations?userId=user_123&limit=20&exclude=item_789,item_012&category=tech

Response: 200 OK
{
  "userId": "user_123",
  "items": [
    {
      "itemId": "item_456",
      "score": 0.92,
      "reason": "cbf",          // cbf | cf | popular | explore
      "position": 1
    }
  ],
  "modelVersion": 42,
  "generatedAt": "2026-02-23T05:00:00.000Z"
}
```

### 7.3 User Feedback

```
POST /api/feedback
{
  "userId": "user_123",
  "itemId": "item_456",
  "feedbackType": "like" | "dislike" | "hide",
  "recommendationId": "rec_789"
}

Response: 200 OK
```

---

## 8. Recommendation Quality Metrics

| Metric | Definition | Target (launch) | Target (mature) |
|--------|-----------|-----------------|-----------------|
| **Precision@10** | % of top-10 recs that get clicked | >15% | >30% |
| **Recall@50** | % of items user would like that appear in top 50 | >10% | >25% |
| **nDCG@20** | Normalized discounted cumulative gain at position 20 | >0.3 | >0.5 |
| **Coverage** | % of catalog items recommended to at least 1 user/week | >30% | >60% |
| **Diversity** | Average pairwise distance of top-10 recs per user | >0.4 | >0.5 |
| **Freshness** | % of recs from items created in last 7 days | >20% | >15% |

### 8.1 A/B Testing Framework

- All recommendation requests include a `modelVersion` for attribution.
- New models are deployed to 10% of traffic initially (canary).
- Promote to 100% after 48h if engagement metrics don't regress >5%.
- Holdout group (5% of users) always gets popularity-only baseline for comparison.

---

## 9. Business Rules & Guardrails

1. **Diversity enforcement:** No more than 3 items from the same category in a top-10 list.
2. **Freshness boost:** Items < 24h old get a 1.5x multiplier; items < 7d old get 1.2x.
3. **Deduplication:** Never recommend items the user has already interacted with (unless return-visit signal is expected behavior).
4. **Content safety:** Items flagged by moderation are excluded from all recommendation lists.
5. **Rate limiting:** Max 60 recommendation requests per user per minute.
6. **Minimum quality:** If no items score above 0.1 threshold, fall back to popular items in user's preferred categories.

---

## 10. Implementation Phases

### Phase 1: Foundation (Weeks 1–3)
- Event collection SDK + ingestion API
- Item feature extraction (TF-IDF or embeddings)
- Content-based recommendations only
- Popularity baseline
- Basic recommendation API
- **Deliverable:** Working recommendations for all users, even with zero history

### Phase 2: Collaborative Filtering (Weeks 4–6)
- ALS model training pipeline (batch)
- User profile aggregation
- Hybrid scoring with weighted switching
- Recommendation quality metrics dashboard
- **Deliverable:** Personalized recommendations that improve with usage

### Phase 3: Optimization (Weeks 7–10)
- A/B testing framework
- Near-real-time user profile updates (15min)
- Contextual signals (time, device, session depth)
- Recommendation cache for latency optimization
- **Deliverable:** Production-grade system with measurable quality improvements

### Phase 4: Scale (Weeks 11+)
- Explore online learning (contextual bandits)
- Knowledge graph enrichment
- Cross-domain recommendations (if multiple content types)
- Model serving optimization (ONNX Runtime)

---

## 11. Technology Stack Recommendation

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Event API | Next.js API routes / Express | Same stack as Mission Control |
| Event queue | Bull (Redis-backed) or in-memory | Simple, battle-tested |
| Primary DB | PostgreSQL (Neon) or SQLite (Turso) | Matches existing DB decision |
| Vector storage | pgvector extension or SQLite + custom | Avoid adding a separate vector DB at this scale |
| ML training | Python (implicit, scikit-learn) | Best ecosystem for ALS/ML |
| Model serving | TypeScript (pre-computed scores) | No Python dependency at serve time |
| Embeddings | ONNX Runtime (all-MiniLM-L6-v2) | Fast, local, no API calls |
| Cron/scheduler | node-cron (existing daemon) | Already running in Mission Control |

---

## 12. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Insufficient interaction data at launch | Poor CF performance | High | Lean on CBF + popularity; aggressive cold-start strategy |
| Model training takes too long | Stale recommendations | Medium | Set 30min timeout; reduce factors if needed; optimize data loading |
| Filter bubble (users get stuck in narrow recs) | User dissatisfaction | Medium | Diversity enforcement; 10% exploration budget; category caps |
| Event flood from bots/crawlers | Corrupted preference data | Medium | Rate limiting; bot detection; minimum session length filter |
| Schema migration pain | Development slowdown | Low | Start with the schema above; use DB migrations from day 1 |

---

## 13. Open Questions (for team discussion)

1. **Content type:** What exactly are we recommending? (Articles, products, tasks, media?) This affects feature extraction strategy.
2. **User authentication:** How do we identify users? (Account-based, anonymous session, or hybrid?)
3. **Catalog size:** Expected number of items at launch and after 6 months? Affects index strategy.
4. **Python dependency:** Is adding Python to the stack acceptable for model training, or must everything be TypeScript?
5. **Embedding model:** Use a local ONNX model or call an embedding API (OpenAI, Cohere)?

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| **ALS** | Alternating Least Squares — matrix factorization algorithm for collaborative filtering |
| **CBF** | Content-Based Filtering — recommends items similar to what user has liked |
| **CF** | Collaborative Filtering — recommends items that similar users have liked |
| **Cold-start** | The problem of making recommendations with little or no user history |
| **nDCG** | Normalized Discounted Cumulative Gain — measures ranking quality |
| **TF-IDF** | Term Frequency-Inverse Document Frequency — text feature extraction method |
| **EWMA** | Exponentially Weighted Moving Average — gives more weight to recent data |
