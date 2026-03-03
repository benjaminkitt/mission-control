import { NextResponse } from "next/server";
import { getDaemonConfig, mutateDaemonConfig } from "@/lib/data";
import type { Profile } from "@/lib/types";
import { profileCreateSchema, profileUpdateSchema, validateBody, DEFAULT_LIMIT } from "@/lib/validations";
import { getAgents } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * Get all profiles from daemon config
 */
function getProfiles(): Profile[] {
  const config = getDaemonConfig();
  const profiles = config.profiles as { definitions?: Profile[] } | undefined;
  return profiles?.definitions ?? [];
}

/**
 * Find a profile by ID
 */
function findProfile(profileId: string): Profile | undefined {
  const profiles = getProfiles();
  return profiles.find((p) => p.id === profileId);
}

/**
 * Get the default profile ID from daemon config
 */
function getDefaultProfileId(): string {
  const config = getDaemonConfig();
  const profiles = config.profiles as { defaultProfileId?: string } | undefined;
  return profiles?.defaultProfileId ?? "default";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  const profiles = getProfiles();
  const total = profiles.length;
  let filtered = profiles;

  if (id) {
    filtered = profiles.filter((p) => p.id === id);
  }

  // Pagination
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");
  const totalFiltered = filtered.length;
  const limit = limitParam ? Math.max(1, parseInt(limitParam, 10) || 50) : DEFAULT_LIMIT;
  const offset = Math.max(0, parseInt(offsetParam ?? "0", 10));
  const returned = filtered.slice(offset, offset + limit);

  return NextResponse.json(
    {
      data: returned,
      profiles: returned,
      meta: { total, filtered: totalFiltered, returned: returned.length, limit, offset },
    },
    { headers: { "Cache-Control": "private, max-age=2, stale-while-revalidate=5" } },
  );
}

export async function POST(request: Request) {
  const validation = await validateBody(request, profileCreateSchema);
  if (!validation.success) return validation.error;
  const body = validation.data;

  const newProfile = await mutateDaemonConfig(async (config) => {
    const profiles = (config.profiles as { definitions?: Profile[]; defaultProfileId?: string }) || {
      definitions: [],
      defaultProfileId: "default",
    };

    // Check for duplicate ID
    if (profiles.definitions?.some((p) => p.id === body.id)) {
      return null;
    }

    const profile: Profile = {
      id: body.id,
      name: body.name,
      description: body.description,
      env: body.env,
    };

    if (!profiles.definitions) {
      profiles.definitions = [];
    }
    profiles.definitions.push(profile);
    config.profiles = profiles;
    return profile;
  });

  if (!newProfile) {
    return NextResponse.json({ error: `Profile with id "${body.id}" already exists` }, { status: 409 });
  }

  return NextResponse.json(newProfile, { status: 201 });
}

export async function PUT(request: Request) {
  const validation = await validateBody(request, profileUpdateSchema);
  if (!validation.success) return validation.error;
  const body = validation.data;

  const updatedProfile = await mutateDaemonConfig(async (config) => {
    const profiles = (config.profiles as { definitions?: Profile[]; defaultProfileId?: string }) || {
      definitions: [],
      defaultProfileId: "default",
    };

    if (!profiles.definitions) {
      return null;
    }

    const idx = profiles.definitions.findIndex((p) => p.id === body.id);
    if (idx === -1) {
      return null;
    }

    // Cannot change the profile ID
    if (body.id !== profiles.definitions[idx].id) {
      return null;
    }

    profiles.definitions[idx] = {
      ...profiles.definitions[idx],
      name: body.name ?? profiles.definitions[idx].name,
      description: body.description !== undefined ? body.description : profiles.definitions[idx].description,
      env: body.env ?? profiles.definitions[idx].env,
    };

    config.profiles = profiles;
    return profiles.definitions[idx];
  });

  if (!updatedProfile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json(updatedProfile);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // Cannot delete the default profile
  const defaultProfileId = getDefaultProfileId();
  if (id === defaultProfileId) {
    return NextResponse.json(
      { error: `Cannot delete the default profile "${defaultProfileId}"` },
      { status: 403 },
    );
  }

  // Check if any agents are using this profile
  const agentsData = await getAgents();
  const agentsUsingProfile = agentsData.agents.filter((a) => a.profileId === id);

  if (agentsUsingProfile.length > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete profile "${id}" — it is assigned to ${agentsUsingProfile.length} agent(s)`,
        affectedAgents: agentsUsingProfile.map((a) => ({ id: a.id, name: a.name })),
      },
      { status: 409 },
    );
  }

  const deleted = await mutateDaemonConfig(async (config) => {
    const profiles = (config.profiles as { definitions?: Profile[]; defaultProfileId?: string }) || {
      definitions: [],
      defaultProfileId: "default",
    };

    if (!profiles.definitions) {
      return false;
    }

    const idx = profiles.definitions.findIndex((p) => p.id === id);
    if (idx === -1) {
      return false;
    }

    profiles.definitions.splice(idx, 1);
    config.profiles = profiles;
    return true;
  });

  if (!deleted) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
