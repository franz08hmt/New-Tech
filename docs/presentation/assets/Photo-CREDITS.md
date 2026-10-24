# Image credits

All photographs are from [Unsplash](https://unsplash.com) and used under the
[Unsplash License](https://unsplash.com/license), which permits free commercial
and non-commercial use without attribution. Attribution is recorded here anyway
so the team can answer where every asset came from.

Files are stored locally rather than hot-linked so the interface still renders
when the demo machine or the Ubuntu VM has no internet connection.

| File | Used for | Unsplash photo id |
| --- | --- | --- |
| `hero-study.webp` | Page hero fallback | `photo-1497215728101-856f4ea42174` |
| `course-cs.webp` | Computer Science backdrop and card | `photo-1461749280684-dccba630e2f6` |
| `course-math.webp` | Mathematics backdrop and card | `photo-1509228468518-180dd4864904` |
| `course-econ.webp` | Economics backdrop and card | `photo-1488459716781-31db52582fe9` |
| `course-bio.webp` | Biology backdrop and card | `photo-1576086213369-97a306d36557` |
| `course-hist.webp` | History backdrop and card | `photo-1466442929976-97f336a657be` |
| `course-lit.webp` | Literature backdrop and card | `photo-1521587760476-6c12a4b040da` |

## Team-supplied images

| File | Used for | Source |
| --- | --- | --- |
| `study-sunset.webp` | Page background behind the workspace shell | Photograph supplied by the team |

The file arrived named `study-sunset.jpg` but its contents are WebP, so it was
renamed to match. Browsers sniff image data and would have rendered it either
way, but Nginx serves the `Content-Type` from the extension, and declaring a
WebP as `image/jpeg` is the kind of detail worth getting right.

It is a portrait image (675 x 1200) used as a `cover` background, so the sides
are cropped on wide screens. Only the frame around the shell is visible, and on
phones the shell is full-bleed, so the background does not show there at all.

Each file was requested from the Unsplash CDN as WebP at the size it is actually
displayed (`fm=webp`, `q=72`), which is why the whole set is under 500 KB.
