# Verification record

The release is gated on lint, strict TypeScript, a clean production build, unit tests, and isolated browser tests.

Upload-correction local result: **10 unit tests and 11 browser tests passed**, lint and strict TypeScript passed, and the production build passed. The complete browser suite took about 76 seconds on installed Chrome. Automated WCAG A/AA checks reported **zero violations** in the checked interface, including the new resize-review dialog. The original release also passed an independent temporary-directory `npm ci --ignore-scripts`, lint, typecheck, unit tests, build, and `npm audit --audit-level=high`; npm reported zero vulnerabilities. The correction adds no dependencies.

The [public verification/deployment workflow](https://github.com/seoshiro/selvedge-studio/actions/workflows/publish.yml) repeats the checks on a fresh Linux runner before deployment. `release.json` and the footer's `data-commit` identify the served source commit. The publication handoff includes the exact commit, successful CI run, and a subsequent real golden-path audit against the public URL.

## Source review

### Upload correction (2026-10-01)

Valid source JPEG/WebP files could expand beyond the fixed stored-PNG cap and show an inaccurate, English-only “2 MB” error despite meeting the advertised 8 MB source limit. Normalization now makes bounded adaptive passes from the original decoded image, preserving alpha and aspect ratio. All extra resizing requires review of a preview, final pixel dimensions, and DPI. Cancellation and failure preserve the current project; aggregate capacity is checked before review and again before mutation. Upload errors and normalization guidance are available in EN/RU/KK. Shared constants keep normalized uploads compatible with portable imports. Stored project schema and storage namespace are unchanged.

New regressions generate deterministic high-entropy JPEG/WebP (about 5.6–5.8 MB source) and translucent PNG (about 6.2 MB source). Each fixture demonstrably exceeds the previous normalized cap. Tests cover accepted review, cancellation, retained transparent/partial-alpha pixels, proportional dimensions, accurate DPI, revision retention, actual PNG/PDF/JSON downloads, local save/reload, and exact import/reload. Boundary checks cover exactly 8,000,000 source bytes and 16 MP, source overflows, malformed/undecodable files, normalized import limits, and failed-import preservation. The review is checked at 360 px in Kazakh and with automated accessibility checks. These are synthetic test images, not the user's original failing artwork.

### Original release review

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
