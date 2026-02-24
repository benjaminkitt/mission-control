"use client";

import { useState, useEffect } from "react";
import { Rocket, Users, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "mc-onboarded";

interface Step {
  icon: typeof Rocket;
  title: string;
  description: string;
  bullets: string[];
}

const steps: Step[] = [
  {
    icon: Rocket,
    title: "Welcome to Mission Control",
    description: "Your AI-powered task management system. Organize work with the Eisenhower Matrix, Kanban boards, and goal tracking.",
    bullets: [
      "Prioritize with the Eisenhower Matrix (Do, Schedule, Delegate, Eliminate)",
      "Track progress with Kanban boards",
      "Set goals with milestones and link tasks to them",
      "Capture ideas instantly with Brain Dump",
    ],
  },
  {
    icon: Users,
    title: "Meet Your AI Team",
    description: "Delegate tasks to specialized AI agents. Create custom agents, assign skills, and orchestrate multi-agent teams.",
    bullets: [
      "5 built-in agents: Researcher, Developer, Marketer, Business Analyst, and You",
      "Create custom agents with unique instructions and capabilities",
      "Assign collaborators for multi-agent teamwork on complex tasks",
      "Run /orchestrate to launch all agents on pending work",
    ],
  },
  {
    icon: Zap,
    title: "Get Started",
    description: "You're all set! Here are some quick tips to get the most out of Mission Control.",
    bullets: [
      "Press Ctrl+K to open the command palette",
      "Press ? to see all keyboard shortcuts",
      "Ctrl+Click tasks to multi-select for bulk actions",
      "Load demo data from the dashboard to see it in action",
    ],
  },
];

export function OnboardingDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Only show on first visit
    if (typeof window !== "undefined" && !localStorage.getItem(STORAGE_KEY)) {
      setOpen(true);
    }
  }, []);

  const handleClose = () => {
    setOpen(false);
    localStorage.setItem(STORAGE_KEY, "true");
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      handleClose();
    }
  };

  const current = steps[step];
  const Icon = current.icon;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>{current.title}</DialogTitle>
              <DialogDescription className="mt-0.5">{current.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ul className="space-y-2 py-2">
          {current.bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="text-primary mt-1 shrink-0">&bull;</span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between pt-2 border-t">
          {/* Step indicators */}
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-6 rounded-full transition-colors ${
                  i === step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose}>
              Skip
            </Button>
            <Button size="sm" onClick={handleNext}>
              {step < steps.length - 1 ? "Next" : "Get Started"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
