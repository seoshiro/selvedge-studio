# Verification record

The release is gated on lint, strict TypeScript, a clean production build, unit tests, and isolated browser tests.

Final local result: **8 unit tests and 8 browser tests passed**, lint and strict TypeScript passed, and the production build passed. The complete browser suite took about 37 seconds on installed Chrome. Automated WCAG A/AA checks reported **zero violations** in the checked interface. An independent temporary-directory install passed `npm ci --ignore-scripts`, lint, typecheck, unit tests, build, and `npm audit --audit-level=high`; npm reported zero vulnerabilities.

The [public verification/deployment workflow](https://github.com/seoshiro/selvedge-studio/actions/workflows/publish.yml) repeats the checks on a fresh Linux runner before deployment. `release.json` and the footer's `data-commit` identify the served source commit. The publication handoff includes the exact commit, successful CI run, and a subsequent real golden-path audit against the public URL.

## Source review

A separate gpt-6.1-sol agent with xhigh reasoning performed a read-only architecture/security/correctness review. Confirmed findings fixed before release:

- Undo could refer to artwork pruned during revision deletion. Live memory now retains undo assets; persistent/portable exports prune only unreferenced records.
- Uploads could exceed the aggregate importer limit. The same limit is enforced before mutation.
- Extreme narrow images could normalize to a zero-width canvas. Each normalized edge is at least one pixel.
- EXIF-oriented JPEGs could be rejected despite valid bounds. Swapped displayed dimensions are accepted while preserving the checked area and edge limits.
- Empty artwork/variant/revision identifiers were accepted. Identifiers must be nonempty, unique where applicable, and references must resolve.
- Proof images could distort the garment ratio; long notes could be clipped. Garments now use aspect-ratio containment, PNG height is measured, and PDF notes paginate.
- Opening another tab unnecessarily saved unchanged work. Existing loaded studies no longer write until edited.
- Drag state used live selection and accepted unrelated pointer endings. It now captures the target and pointer identity.

## Meaningful automated coverage

Unit tests cover immutable geometry, proportional dimensions/DPI, front/back apply-to-all, independent revisions, malformed schema and references, duplicate/empty IDs, aggregate bounds, and revision asset retention.

Browser tests cover a real synthetic PNG/JPEG upload → front/back numeric editing → consistent collection placements → custom colors/add/remove → named revision compare/restore → actual PNG/PDF/project downloads → reload → reset cancellation/confirmation → exact project import and reload. Download bytes are checked for PNG dimensions, PDF page structure, and complete validated JSON.

Regressions also cover a 1×8192 raster, forged SVG/remote artwork imports, empty sides, undo after revision deletion, two-tab write conflicts, mouse dragging, keyboard undo, all three locale layouts at 320/360/390/414/768/1280/1440 pixels, landscape, zoom, reduced motion, skip navigation, long strings/notes, and automated WCAG A/AA checks.

Proof downloads are independently inspected with Python pypdf and visual review of the extracted PDF image and contact sheet. Screenshots in the README show the actual application, not a design mockup.

## Practical scope

Local browser coverage uses installed desktop Chrome. CI uses Linux Playwright Chromium. Automated accessibility checks support manual keyboard/layout review but do not prove every assistive-technology combination. Browser storage can be removed by the user or browser. Freehand image placement is a visual aid; physical production needs printer confirmation. Large artwork is normalized and bounded. No claims of photorealism, 3D, Pantone matching, certified print readiness, commercial availability, or revenue are made.
