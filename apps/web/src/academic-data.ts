import {
  BeakerIcon,
  BookOpenIcon,
  BuildingLibraryIcon,
  ChartBarIcon,
  ComputerDesktopIcon,
  VariableIcon,
} from "@heroicons/react/24/outline";

// These fixtures are explicitly labelled as examples in the interface.
// Covers live in apps/web/public/img so the interface still renders offline;
// see img/CREDITS.md for the source of each photograph.
export const courses = [
  {
    name: "Computer Science",
    code: "CS 201",
    detail: "Algorithms & software engineering",
    progress: 62,
    tone: "slate",
    icon: ComputerDesktopIcon,
    cover: "/img/course-cs.webp",
    coverAlt: "Source code on a dark editor screen",
  },
  {
    name: "Mathematics",
    code: "MA 210",
    detail: "Linear algebra & proof technique",
    progress: 45,
    tone: "sage",
    icon: VariableIcon,
    cover: "/img/course-math.webp",
    coverAlt: "A system of linear equations written on paper",
  },
  {
    name: "Economics",
    code: "EC 102",
    detail: "Principles of microeconomics",
    progress: 38,
    tone: "sand",
    icon: ChartBarIcon,
    cover: "/img/course-econ.webp",
    coverAlt: "Fruit and vegetable stall at a covered market",
  },
  {
    name: "Biology",
    code: "BI 150",
    detail: "Cells, genetics & lab method",
    progress: 29,
    tone: "navy",
    icon: BeakerIcon,
    cover: "/img/course-bio.webp",
    coverAlt: "Fluorescent microscopy image of stained cells",
  },
  {
    name: "History",
    code: "HI 204",
    detail: "Ideas that shaped our world",
    progress: 54,
    tone: "sage",
    icon: BuildingLibraryIcon,
    cover: "/img/course-hist.webp",
    coverAlt: "Stone domes and minarets of a historic monument",
  },
  {
    name: "Literature",
    code: "LT 101",
    detail: "Reading, writing & critical thinking",
    progress: 76,
    tone: "navy",
    icon: BookOpenIcon,
    cover: "/img/course-lit.webp",
    coverAlt: "Wall of old hardback books on wooden shelves",
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
