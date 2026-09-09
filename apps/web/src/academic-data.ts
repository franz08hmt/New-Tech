import {
  BookOpenIcon,
  BuildingLibraryIcon,
  ChartBarIcon,
  ComputerDesktopIcon,
} from "@heroicons/react/24/outline";

// These fixtures are explicitly labelled as examples in the interface.
export const courses = [
  {
    name: "Computer Science",
    code: "CS 201",
    detail: "Algorithms & software engineering",
    progress: 62,
    tone: "slate",
    icon: ComputerDesktopIcon,
  },
  {
    name: "Economics",
    code: "EC 102",
    detail: "Principles of microeconomics",
    progress: 38,
    tone: "sand",
    icon: ChartBarIcon,
  },
  {
    name: "History",
    code: "HI 204",
    detail: "Ideas that shaped our world",
    progress: 54,
    tone: "sage",
    icon: BuildingLibraryIcon,
  },
  {
    name: "Literature",
    code: "LT 101",
    detail: "Reading, writing & critical thinking",
    progress: 76,
    tone: "navy",
    icon: BookOpenIcon,
  },
];
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
    title: "CourseMate workspace",
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
