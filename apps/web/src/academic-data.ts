import {
  AcademicCapIcon,
  BeakerIcon,
  BookOpenIcon,
  BuildingLibraryIcon,
  ChartBarIcon,
  ComputerDesktopIcon,
  VariableIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";

type CourseIcon = ComponentType<SVGProps<SVGSVGElement>>;

// Icons are presentation, not course data. Course content now comes from the
// API; this local map keeps Heroicons out of the HTTP contract.
const courseIcons: Record<string, CourseIcon> = {
  "cs-201": ComputerDesktopIcon,
  "ma-210": VariableIcon,
  "ec-102": ChartBarIcon,
  "bi-150": BeakerIcon,
  "hi-204": BuildingLibraryIcon,
  "lt-101": BookOpenIcon,
};

export function courseIconFor(slug: string): CourseIcon {
  return courseIcons[slug] ?? AcademicCapIcon;
}

export const exams = [
  {
    name: "Computer Science",
    topic: "Algorithms midterm",
    date: "2026-09-21",
    time: "09:00",
    room: "Room A201",
  },
  {
    name: "Economics",
    topic: "Microeconomics quiz",
    date: "2026-09-24",
    time: "13:30",
    room: "Room B102",
  },
  {
    name: "Literature",
    topic: "Essay presentation",
    date: "2026-09-28",
    time: "10:00",
    room: "Room C301",
  },
];

export const research = [
  {
    status: "To explore",
    title: "Document-grounded AI",
    detail: "Read about retrieval and citations",
    owner: "Thắng",
    tone: "sand",
  },
  {
    status: "In progress",
    title: "ExaMate workspace",
    detail: "Build an accessible academic dashboard",
    owner: "Tài",
    tone: "rose",
  },
  {
    status: "To review",
    title: "Architecture review",
    detail: "Trace a request from UI to database",
    owner: "Tài & Thắng",
    tone: "sage",
  },
];
