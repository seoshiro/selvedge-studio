import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Upload,
  Download,
  Undo2,
  Redo2,
  Plus,
  X,
  Check,
  Move,
  SlidersHorizontal,
  Eye,
  RotateCcw,
  Trash2,
  FileText,
  Layers,
  ShieldCheck,
  Minus,
} from "lucide-react";
import {
  applyPlacement,
  clamp,
  clone,
  COLORS,
  dpi,
  geometry,
  pruneAssets,
  seed,
  validateProject,
  type Placement,
  type Project,
  type Revision,
  type Side,
  type Snapshot,
} from "./model";
import { sampleAsset, readArtwork, verifyAssets } from "./images";
import { readStored, writeStored } from "./storage";
import { dictionaries, type Locale } from "./i18n";
import { exportPDF, exportPNG, exportProject } from "./export";
import { Garment } from "./TeeView";
declare const __COMMIT__: string;

function Modal({
  children,
  title,
  onClose,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const d = ref.current;
    document.body.style.overflow = "hidden";
    return () => {
      d?.close();
      document.body.style.overflow = "";
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-body">
        <button
          className="icon close"
          onClick={onClose}
          aria-label={
            dictionaries[document.documentElement.lang as Locale]?.close ??
            "Close"
          }
        >
          <X size={20} />
        </button>
        {children}
      </div>
    </dialog>
  );
}
export function App() {
  const [locale, setLocale] = useState<Locale>(() => {
      try {
        const v = localStorage.getItem("selvedge-locale-v1");
        return v === "ru" || v === "kk" ? v : "en";
      } catch {
        return "en";
      }
    }),
    t = dictionaries[locale];
  const [p, setP] = useState<Project>(seed),
    pRef = useRef(p),
    [ready, setReady] = useState(false),
    [saveState, setSaveState] = useState<"saving" | "saved" | "error">(
      "saving",
    ),
    [saveError, setSaveError] = useState("");
  const version = useRef(0),
    lastSaved = useRef<Project | null>(null),
    saveQueue = useRef(Promise.resolve()),
    saveLocked = useRef(false),
    [selected, setSelected] = useState("color-0"),
    [side, setSide] = useState<Side>("front"),
    [guides, setGuides] = useState(true);
  const [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    busyRef = useRef(false),
    [revisionName, setRevisionName] = useState(""),
    [compare, setCompare] = useState<Revision | null>(null),
    [showPrivacy, setShowPrivacy] = useState(false),
    [pending, setPending] = useState<Project | null>(null);
  const [history, setHistory] = useState<{
      past: Snapshot[];
      future: Snapshot[];
    }>({ past: [], future: [] }),
    historyRef = useRef(history),
    drag = useRef<{
      x: number;
      y: number;
      snapshot: Snapshot;
      placement: Placement;
      scale: number;
      target: string;
      side: Side;
      pointerId: number;
    } | null>(null),
    [dragging, setDragging] = useState(false),
    [touchMove, setTouchMove] = useState(false);
  const artInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    [story, setStory] = useState(0);
  const v =
      p.snapshot.variants.find((v) => v.id === selected) ??
      p.snapshot.variants[0],
    a = p.assets.find((a) => a.id === v[side].asset),
    g = geometry(v[side], a),
    raster = dpi(v[side], a);
  function replace(next: Project) {
    pRef.current = next;
    setP(next);
  }
  function hist(next: typeof history) {
    historyRef.current = next;
    setHistory(next);
  }
  function commit(s: Snapshot) {
    if (drag.current) pointerEnd(true);
    hist({
      past: [...historyRef.current.past, pRef.current.snapshot].slice(-50),
      future: [],
    });
    replace({ ...pRef.current, snapshot: s });
  }
  function update(patch: Partial<Placement>, all = false) {
    commit(applyPlacement(pRef.current.snapshot, v.id, side, patch, all));
  }
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const stored = await readStored();
        if (!live) return;
        if (stored) {
          version.current = stored.version;
          pRef.current = stored.project;
          setP(stored.project);
          lastSaved.current = stored.project;
          setSaveState("saved");
          setSelected(stored.project.snapshot.variants[0].id);
        } else {
          const asset = await sampleAsset();
          if (!live) return;
          const initial = seed();
          initial.assets = [asset];
          initial.snapshot.variants = initial.snapshot.variants.map((v) => ({
            ...v,
            front: { ...v.front, width: 30, asset: asset.id },
          }));
          initial.revisions = [
            {
              id: "first-study",
              name: "First study",
              date: new Date().toISOString(),
              snapshot: clone(initial.snapshot),
            },
          ];
          pRef.current = initial;
          setP(initial);
        }
      } catch (e) {
        if (live) {
          saveLocked.current = true;
          setSaveState("error");
          setSaveError(e instanceof Error ? e.message : String(e));
          const asset = await sampleAsset();
          const initial = seed();
          initial.assets = [asset];
          initial.snapshot.variants = initial.snapshot.variants.map((v) => ({
            ...v,
            front: { ...v.front, width: 30, asset: asset.id },
          }));
          pRef.current = initial;
          setP(initial);
        }
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem("selvedge-locale-v1", locale);
    } catch {
      /* preference only */
    }
  }, [locale]);
  useEffect(() => {
    if (!ready || saveLocked.current || dragging || p === lastSaved.current)
      return;
    setSaveState("saving");
    const snapshot = p;
    const timer = setTimeout(() => {
      saveQueue.current = saveQueue.current.then(async () => {
        if (saveLocked.current) return;
        try {
          version.current = await writeStored(
            pruneAssets(snapshot),
            version.current,
          );
          lastSaved.current = snapshot;
          if (pRef.current === snapshot) setSaveState("saved");
        } catch (e) {
          saveLocked.current = true;
          setSaveState("error");
          setSaveError(e instanceof Error ? e.message : String(e));
        }
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [p, ready, dragging]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in-view");
            if (e.target.hasAttribute("data-story"))
              setStory(Number(e.target.getAttribute("data-story")));
          }
        });
      },
      { threshold: 0.28 },
    );
    document
      .querySelectorAll(".reveal,[data-story]")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ready]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName) &&
        !busyRef.current &&
        !drag.current
      ) {
        e.preventDefault();
        undo(e.shiftKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (saveState === "saving" || saveState === "error") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [saveState]);
  function undo(redo = false) {
    const h = historyRef.current;
    if (redo) {
      if (!h.future.length) return;
      const s = h.future[0];
      hist({
        past: [...h.past, pRef.current.snapshot],
        future: h.future.slice(1),
      });
      replace({ ...pRef.current, snapshot: s });
    } else {
      if (!h.past.length) return;
      const s = h.past.at(-1)!;
      hist({
        past: h.past.slice(0, -1),
        future: [pRef.current.snapshot, ...h.future],
      });
      replace({ ...pRef.current, snapshot: s });
    }
  }
  async function run(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    await run(async () => {
      if (pRef.current.assets.length >= 16) throw new Error(t.assetLimit);
      const target = v.id,
        targetSide = side,
        asset = await readArtwork(file);
      if (
        pRef.current.assets.reduce(
          (total, item) => total + item.data.length,
          asset.data.length,
        ) > 20_000_000
      )
        throw new Error(t.assetLimit);
      hist({
        past: [...historyRef.current.past, pRef.current.snapshot].slice(-50),
        future: [],
      });
      replace({
        ...pRef.current,
        assets: [...pRef.current.assets, asset],
        snapshot: applyPlacement(pRef.current.snapshot, target, targetSide, {
          asset: asset.id,
        }),
      });
    });
  }
  async function importFile(file?: File) {
    if (!file) return;
    await run(async () => {
      if (file.size > 24_000_000) throw new Error(t.importHelp);
      const next = validateProject(JSON.parse(await file.text()));
      await verifyAssets(next.assets);
      setPending(next);
    });
  }
  function replaceStudy(next: Project) {
    replace(next);
    hist({ past: [], future: [] });
    setSelected(next.snapshot.variants[0].id);
    setSide("front");
    setCompare(null);
    setPending(null);
    setNotice(t.imported);
  }
  function saveRevision() {
    if (!revisionName.trim()) {
      setError(t.nameRequired);
      return;
    }
    if (p.revisions.length >= 8) {
      setError(t.revisionLimit);
      return;
    }
    replace({
      ...pRef.current,
      revisions: [
        ...pRef.current.revisions,
        {
          id: crypto.randomUUID(),
          name: revisionName.trim().slice(0, 60),
          date: new Date().toISOString(),
          snapshot: clone(pRef.current.snapshot),
        },
      ],
    });
    setRevisionName("");
    setNotice(t.revisionSaved);
    setError("");
  }
  function addColor(color: string, name: string) {
    if (p.snapshot.variants.length >= 6) {
      setError(t.colorLimit);
      return;
    }
    const id = crypto.randomUUID();
    commit({
      ...p.snapshot,
      variants: [
        ...p.snapshot.variants,
        { id, color, name, front: clone(v.front), back: clone(v.back) },
      ],
    });
    setSelected(id);
  }
  function pointerDown(e: PointerEvent<HTMLDivElement>) {
    if (
      !a ||
      busy ||
      e.button !== 0 ||
      (e.pointerType === "touch" && !touchMove) ||
      drag.current
    )
      return;
    const svg = e.currentTarget.querySelector("svg")!,
      rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / 500, rect.height / 560),
      px = (e.clientX - rect.left - (rect.width - 500 * scale) / 2) / scale,
      py = (e.clientY - rect.top - (rect.height - 560 * scale) / 2) / scale,
      rad = (-v[side].angle * Math.PI) / 180;
    const x = (px - g.cx) * Math.cos(rad) - (py - g.cy) * Math.sin(rad) + g.cx,
      y = (px - g.cx) * Math.sin(rad) + (py - g.cy) * Math.cos(rad) + g.cy;
    if (x < g.x || x > g.x + g.width || y < g.y || y > g.y + g.height) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      snapshot: clone(p.snapshot),
      placement: clone(v[side]),
      scale,
      target: v.id,
      side,
      pointerId: e.pointerId,
    };
    setDragging(true);
  }
  function pointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    replace({
      ...pRef.current,
      snapshot: applyPlacement(d.snapshot, d.target, d.side, {
        x:
          Math.round(
            clamp(d.placement.x + (e.clientX - d.x) / d.scale / 4.7, -15, 15) *
              10,
          ) / 10,
        y:
          Math.round(
            clamp(d.placement.y + (e.clientY - d.y) / d.scale / 4.7, 0, 55) *
              10,
          ) / 10,
      }),
    });
  }
  function pointerEnd(cancel = false) {
    const d = drag.current;
    if (!d) return;
    if (cancel) replace({ ...pRef.current, snapshot: d.snapshot });
    else if (
      JSON.stringify(d.snapshot) !== JSON.stringify(pRef.current.snapshot)
    )
      hist({
        past: [...historyRef.current.past, d.snapshot].slice(-50),
        future: [],
      });
    drag.current = null;
    setDragging(false);
  }
  const mini = (i: number, className = "") => (
    <Garment
      className={className}
      variant={p.snapshot.variants[i % p.snapshot.variants.length]}
      assets={p.assets}
    />
  );
  return (
    <>
      <a className="skip" href="#studio">
        {t.jump}
      </a>
      <header className="nav">
        <a href="#" className="wordmark" aria-label="SELVEDGE home">
          SELVEDGE
          <span className="brand-dot" />
        </a>
        <nav aria-label="Main">
          <a href="#collection">{t.collection}</a>
          <a href="#process">{t.process}</a>
        </nav>
        <div className="nav-right">
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            aria-label={t.language}
          >
            <option value="en">EN</option>
            <option value="ru">RU</option>
            <option value="kk">KK</option>
          </select>
          <a className="nav-studio" href="#studio">
            {t.studio}
            <ArrowUpRight size={17} />
          </a>
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span /> {t.heroLabel}
            </p>
            <h1>
              {t.heroA}
              <br />
              {t.heroB}
              <br />
              <em>{t.heroC}</em>
            </h1>
            <p className="hero-desc">{t.heroDesc}</p>
            <a className="button dark" href="#studio">
              {t.start}
              <ArrowUpRight size={20} />
            </a>
            <p className="hero-foot">
              <ShieldCheck size={14} />
              {t.private}
            </p>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="diagram-line vertical" />
            <div className="diagram-line horizontal" />
            <span className="visual-coordinate">
              S / 001
              <br />
              23.5 — 14.0
            </span>
            <div className="hero-tee tee-back">{mini(2)}</div>
            <div className="hero-tee tee-mid">{mini(0)}</div>
            <div className="hero-tee tee-front">{mini(1)}</div>
            <div className="visual-caption">
              <span>STUDY / {p.snapshot.name}</span>
              <span>{p.snapshot.variants.length} COLORWAYS / 1 IDEA</span>
            </div>
            <span className="visual-cross">+</span>
            <span className="vertical-label">
              INDEPENDENT COLLECTION STUDIES
            </span>
          </div>
        </section>
        <div className="local-strip">
          <span className="eyebrow">{t.local}</span>
          <p>{t.localText}</p>
          <span className="strip-index">01 — 03</span>
        </div>
        <section id="collection" className="palette-section">
          <div className="section-head reveal">
            <p className="eyebrow">01 / {t.palette}</p>
            <h2>
              {t.intro}
              <br />
              <em>{t.intro2}</em>
            </h2>
            <p>{t.paletteDesc}</p>
          </div>
          <div className="palette-grid">
            {p.snapshot.variants.slice(0, 3).map((variant, i) => (
              <a
                href="#studio"
                className="palette-card reveal"
                key={variant.id}
                onClick={() => {
                  pointerEnd(true);
                  setSelected(variant.id);
                }}
              >
                <div className="palette-figure">
                  <Garment variant={variant} assets={p.assets} />
                  <span className="palette-number">0{i + 1}</span>
                </div>
                <div className="palette-name">
                  <span>
                    <i style={{ background: variant.color }} />
                    {variant.name}
                  </span>
                  <span>
                    {variant.color.toUpperCase()}
                    <ArrowUpRight size={16} />
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>
        <section id="process" className="process-section">
          <div className="process-visual">
            <div className="process-paper">
              <div className="proof-kicker">SELVEDGE / STUDY NOTES</div>
              {story === 2 ? (
                <div className="proof-mini-grid">
                  {p.snapshot.variants.slice(0, 3).map((variant) => (
                    <Garment
                      key={variant.id}
                      variant={variant}
                      assets={p.assets}
                    />
                  ))}
                </div>
              ) : (
                <Garment
                  variant={
                    p.snapshot.variants[story % p.snapshot.variants.length]
                  }
                  assets={p.assets}
                  guides={story === 1}
                />
              )}
              <div className="paper-bottom">
                <span>{p.snapshot.name}</span>
                <span>
                  {story === 2
                    ? "COLLECTION PROOF"
                    : story === 1
                      ? "REVISION / 02"
                      : "PLACEMENT / 01"}
                </span>
              </div>
            </div>
            <div className="process-stamp">
              S.<span>MADE WITH INTENTION</span>
            </div>
          </div>
          <div className="process-copy">
            <p className="eyebrow">02 / {t.process}</p>
            <h2>{t.intro2}</h2>
            <p className="process-intro">{t.introText}</p>
            {[1, 2, 3].map((n, i) => (
              <article data-story={i} key={n}>
                <span className="step-index">0{n}</span>
                <h3>{t[`step${n}` as "step1"]}</h3>
                <p>{t[`step${n}Text` as "step1Text"]}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="studio" className="studio-section">
          <div className="studio-heading">
            <div>
              <p className="eyebrow">03 / {t.workspace}</p>
              <h2>{t.workspaceDesc}</h2>
            </div>
            <p className={`save-status ${saveState}`} role="status">
              <span />
              {!ready
                ? t.loading
                : saveState === "saving"
                  ? t.saving
                  : saveState === "saved"
                    ? t.saved
                    : t.saveFailed}
            </p>
          </div>
          {saveError && (
            <div className="alert" role="alert">
              {saveError}
            </div>
          )}
          {error && (
            <div className="alert" role="alert">
              <span>{error}</span>
              <button
                className="icon"
                aria-label={t.close}
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="workroom">
            <aside className="controls">
              <div className="control-title">
                <SlidersHorizontal size={16} />
                {t.artwork}
                <span>01</span>
              </div>
              <button
                className="upload"
                onClick={() => artInput.current?.click()}
                disabled={busy || !ready}
              >
                <Upload size={20} />
                <strong>{busy ? t.working : t.upload}</strong>
                <small>{t.uploadHelp}</small>
              </button>
              <input
                ref={artInput}
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label={t.upload}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  void upload(file);
                }}
              />
              {a ? (
                <div className="asset-row">
                  <img src={a.data} alt="" />
                  <span title={a.name}>{a.name}</span>
                  <button
                    className="icon"
                    disabled={busy}
                    onClick={() => update({ asset: null })}
                    aria-label={t.removeArt}
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <p className="no-art">{t.empty}</p>
              )}
              <div className="control-title">
                <Move size={16} />
                {t.placement}
                <span>02</span>
              </div>
              <div className="numeric-fields">
                {(
                  [
                    {
                      key: "width",
                      label: t.width,
                      min: 4,
                      max: 36,
                      unit: "cm",
                    },
                    {
                      key: "x",
                      label: t.offset,
                      min: -15,
                      max: 15,
                      unit: "cm",
                    },
                    { key: "y", label: t.top, min: 0, max: 55, unit: "cm" },
                    {
                      key: "angle",
                      label: t.rotation,
                      min: -180,
                      max: 180,
                      unit: "°",
                    },
                  ] as const
                ).map((f) => (
                  <label key={f.key}>
                    <span>{f.label}</span>
                    <div className="number">
                      <input
                        type="number"
                        aria-label={f.label}
                        value={v[side][f.key]}
                        min={f.min}
                        max={f.max}
                        step={f.key === "angle" ? 1 : 0.1}
                        disabled={busy || !ready}
                        onChange={(e) =>
                          update({
                            [f.key]: clamp(
                              Number(e.target.value),
                              f.min,
                              f.max,
                            ),
                          })
                        }
                      />
                      <span>{f.unit}</span>
                    </div>
                  </label>
                ))}
              </div>
              {a && (
                <div className="raster-info">
                  <span>
                    {t.actualHeight}
                    <b>
                      {((v[side].width * a.height) / a.width).toFixed(1)} cm
                    </b>
                  </span>
                  <span>
                    {t.raster}
                    <b className={raster! < 150 ? "low" : ""}>{raster} DPI</b>
                  </span>
                  {raster! < 150 && <p>{t.lowRes}</p>}
                </div>
              )}
              <button
                className="text-button"
                onClick={() => update({ x: 0, angle: 0 })}
                disabled={busy || !ready}
              >
                {t.center}
                <Plus size={14} />
              </button>
              <button
                className="button outlined apply"
                onClick={() => {
                  update(v[side], true);
                  setNotice(t.allApplied);
                }}
                disabled={busy || !ready}
              >
                {t.applyAll}
                <ArrowRight size={17} />
              </button>
              <p className="fine-print">{t.normalized}</p>
            </aside>
            <div className="stage-column">
              <div className="stage-toolbar">
                <div className="segmented" aria-label={t.view}>
                  <button
                    aria-pressed={side === "front"}
                    onClick={() => setSide("front")}
                    disabled={busy || dragging}
                  >
                    {t.front}
                  </button>
                  <button
                    aria-pressed={side === "back"}
                    onClick={() => setSide("back")}
                    disabled={busy || dragging}
                  >
                    {t.back}
                  </button>
                </div>
                <div className="stage-tools">
                  <button
                    className={`icon mobile-move ${touchMove ? "active" : ""}`}
                    aria-label={t.placement}
                    aria-pressed={touchMove}
                    onClick={() => setTouchMove(!touchMove)}
                  >
                    <Move size={18} />
                  </button>
                  <button
                    className={`icon ${guides ? "active" : ""}`}
                    aria-label={t.guides}
                    aria-pressed={guides}
                    onClick={() => setGuides(!guides)}
                  >
                    <Eye size={18} />
                  </button>
                  <span />
                  <button
                    className="icon"
                    aria-label={t.undo}
                    onClick={() => undo()}
                    disabled={!history.past.length || busy || dragging}
                  >
                    <Undo2 size={18} />
                  </button>
                  <button
                    className="icon"
                    aria-label={t.redo}
                    onClick={() => undo(true)}
                    disabled={!history.future.length || busy || dragging}
                  >
                    <Redo2 size={18} />
                  </button>
                </div>
              </div>
              <div
                className={`stage ${dragging ? "dragging" : ""}`}
                style={{ touchAction: touchMove ? "none" : "pan-y" }}
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={(e) => {
                  if (drag.current?.pointerId === e.pointerId) pointerEnd();
                }}
                onPointerCancel={(e) => {
                  if (drag.current?.pointerId === e.pointerId) pointerEnd(true);
                }}
                onLostPointerCapture={(e) => {
                  if (drag.current?.pointerId === e.pointerId) pointerEnd(true);
                }}
              >
                <div className="stage-corner">
                  S /{" "}
                  {String(p.snapshot.variants.indexOf(v) + 1).padStart(2, "0")}
                  <br />
                  {v.color.toUpperCase()}
                </div>
                <Garment
                  variant={v}
                  side={side}
                  assets={p.assets}
                  guides={guides}
                  label={`${v.name} / ${t[side]}`}
                />
                <span className="stage-baseline">
                  RELAXED TEE / VISUAL STUDY
                </span>
              </div>
              <div className="stage-footer">
                <Move size={14} />
                <span>{t.drag}</span>
              </div>
              <div className="colorway-thumbs">
                {p.snapshot.variants.map((variant) => (
                  <button
                    key={variant.id}
                    aria-label={`${t.thumbnail}: ${variant.name}`}
                    aria-pressed={variant.id === v.id}
                    onClick={() => setSelected(variant.id)}
                    disabled={busy || dragging}
                  >
                    <Garment variant={variant} side={side} assets={p.assets} />
                    <span>
                      <i style={{ background: variant.color }} />
                      {variant.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <aside className="collection-controls">
              <div className="control-title">
                <Layers size={16} />
                {t.colorways}
                <span>03</span>
              </div>
              <label className="field-label">
                {t.rename}
                <input
                  maxLength={80}
                  value={p.snapshot.name}
                  disabled={busy || !ready}
                  onChange={(e) =>
                    commit({ ...p.snapshot, name: e.target.value })
                  }
                />
              </label>
              <div className="selected-color">
                <label>
                  <span>{t.custom}</span>
                  <input
                    type="color"
                    aria-label={t.custom}
                    value={v.color}
                    disabled={busy || !ready}
                    onChange={(e) =>
                      commit({
                        ...p.snapshot,
                        variants: p.snapshot.variants.map((item) =>
                          item.id === v.id
                            ? { ...item, color: e.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
                <label className="field-label">
                  {t.colorName}
                  <input
                    value={v.name}
                    maxLength={40}
                    disabled={busy || !ready}
                    onChange={(e) =>
                      commit({
                        ...p.snapshot,
                        variants: p.snapshot.variants.map((item) =>
                          item.id === v.id
                            ? { ...item, name: e.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
              </div>
              <div className="curated-colors">
                {COLORS.map((c) => (
                  <button
                    key={c.color}
                    title={c.name}
                    aria-label={`${t.addColor}: ${c.name}`}
                    disabled={p.snapshot.variants.length >= 6 || busy || !ready}
                    onClick={() => addColor(c.color, c.name)}
                  >
                    <i style={{ background: c.color }} />
                    <Plus size={12} />
                  </button>
                ))}
              </div>
              <div className="color-actions">
                <button
                  className="text-button"
                  onClick={() => addColor("#8a877e", t.newColor)}
                  disabled={p.snapshot.variants.length >= 6 || busy || !ready}
                >
                  <Plus size={14} />
                  {t.addColor}
                </button>
                <button
                  className="icon"
                  aria-label={t.removeColor}
                  disabled={p.snapshot.variants.length === 1 || busy || !ready}
                  onClick={() =>
                    commit({
                      ...p.snapshot,
                      variants: p.snapshot.variants.filter(
                        (item) => item.id !== v.id,
                      ),
                    })
                  }
                >
                  <Minus size={16} />
                </button>
              </div>
              <label className="field-label notes">
                {t.notes}
                <textarea
                  aria-label={t.notes}
                  value={p.snapshot.notes}
                  maxLength={1000}
                  rows={4}
                  placeholder={t.notesHelp}
                  disabled={busy || !ready}
                  onChange={(e) =>
                    commit({ ...p.snapshot, notes: e.target.value })
                  }
                />
              </label>
              <div className="control-title">
                <RotateCcw size={16} />
                {t.revisions}
                <span>04</span>
              </div>
              <div className="revision-input">
                <input
                  aria-label={t.revisionName}
                  placeholder={t.revisionName}
                  maxLength={60}
                  value={revisionName}
                  disabled={busy || !ready}
                  onChange={(e) => setRevisionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRevision();
                  }}
                />
                <button
                  aria-label={t.saveRevision}
                  className="icon"
                  onClick={saveRevision}
                  disabled={busy || !ready || p.revisions.length >= 8}
                >
                  <Plus size={18} />
                </button>
              </div>
              <div className="revision-list">
                {!p.revisions.length && (
                  <p className="fine-print">{t.noRevisions}</p>
                )}
                {p.revisions
                  .slice()
                  .reverse()
                  .map((r, i) => (
                    <div className="revision" key={r.id}>
                      <button
                        className="revision-open"
                        onClick={() => setCompare(r)}
                        disabled={busy}
                      >
                        <span>
                          R{String(p.revisions.length - i).padStart(2, "0")}
                        </span>
                        <strong>{r.name}</strong>
                        <small>
                          {t.compare}
                          <ArrowUpRight size={12} />
                        </small>
                      </button>
                      <button
                        className="icon"
                        aria-label={`${t.deleteRevision}: ${r.name}`}
                        onClick={() => {
                          if (window.confirm(t.deleteConfirm))
                            replace({
                              ...pRef.current,
                              revisions: pRef.current.revisions.filter(
                                (item) => item.id !== r.id,
                              ),
                            });
                        }}
                        disabled={busy}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
              </div>
            </aside>
          </div>
          <div className="studio-warning">
            <span>↳</span>
            {t.warning}
          </div>
        </section>
        <section className="handoff">
          <div>
            <p className="eyebrow">04 / {t.exports}</p>
            <h2>{t.proofTitle}</h2>
            <p>{t.exportDesc}</p>
            <p className="fine-print">{t.downloadHint}</p>
          </div>
          <div className="export-buttons">
            <button
              aria-label={t.png}
              onClick={() =>
                void run(async () => {
                  await exportPNG(clone(pRef.current), t);
                  setNotice(t.ready);
                })
              }
              disabled={busy || !ready}
            >
              <span className="export-number">01</span>
              <span>
                <strong>{t.png}</strong>
                <small>1600 PX / {p.snapshot.variants.length} COLORWAYS</small>
              </span>
              <Download size={20} />
            </button>
            <button
              aria-label={t.pdf}
              onClick={() =>
                void run(async () => {
                  await exportPDF(clone(pRef.current), t);
                  setNotice(t.ready);
                })
              }
              disabled={busy || !ready}
            >
              <span className="export-number">02</span>
              <span>
                <strong>{t.pdf}</strong>
                <small>
                  A4 / {p.snapshot.variants.length} {t.colorways.toUpperCase()}{" "}
                  + {t.notes.toUpperCase()}
                </small>
              </span>
              <FileText size={20} />
            </button>
            <button
              aria-label={t.project}
              onClick={() => {
                exportProject(pruneAssets(pRef.current));
                setNotice(t.ready);
              }}
              disabled={busy || !ready}
            >
              <span className="export-number">03</span>
              <span>
                <strong>{t.project}</strong>
                <small>JSON / ARTWORK + REVISIONS</small>
              </span>
              <Layers size={20} />
            </button>
            <div className="project-actions">
              <button
                className="text-button"
                onClick={() => projectInput.current?.click()}
                disabled={busy || !ready}
              >
                <Upload size={14} />
                {t.import}
              </button>
              <button
                className="text-button"
                disabled={busy || !ready}
                onClick={() => setPending(seed())}
              >
                {t.reset}
                <RotateCcw size={14} />
              </button>
            </div>
            <input
              ref={projectInput}
              className="sr-only"
              type="file"
              accept=".json,application/json"
              aria-label={t.import}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void importFile(file);
              }}
            />
          </div>
        </section>
      </main>
      <footer>
        <div className="footer-logo">
          SELVEDGE<span>™</span>
        </div>
        <div className="footer-bottom">
          <p>{t.footer}</p>
          <div>
            <button onClick={() => setShowPrivacy(true)}>{t.privacy}</button>
            <a
              href="https://github.com/seoshiro/selvedge-studio"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
              <ArrowUpRight size={13} />
            </a>
            <span className="build" data-commit={__COMMIT__}>
              {__COMMIT__.slice(0, 7)}
            </span>
          </div>
        </div>
      </footer>
      {(notice || busy) && (
        <div className="toast" role="status">
          {busy ? <span className="spinner" /> : <Check size={17} />}{" "}
          {busy ? t.working : notice}
        </div>
      )}
      {compare && (
        <Modal title={t.compareTitle} onClose={() => setCompare(null)}>
          <p className="eyebrow">REVISION / {compare.name}</p>
          <h2>{t.compareTitle}</h2>
          <p className="modal-desc">{t.compareDesc}</p>
          <div className="segmented compare-side">
            <button
              aria-pressed={side === "front"}
              onClick={() => setSide("front")}
            >
              {t.front}
            </button>
            <button
              aria-pressed={side === "back"}
              onClick={() => setSide("back")}
            >
              {t.back}
            </button>
          </div>
          <div className="compare-grid">
            <div>
              <span className="eyebrow">{t.earlier}</span>
              {compare.snapshot.variants.find((item) => item.id === v.id) ? (
                <Garment
                  variant={compare.snapshot.variants.find(
                    (item) => item.id === v.id,
                  )!}
                  side={side}
                  assets={p.assets}
                  label={t.earlier}
                />
              ) : (
                <div className="missing-color">{t.revisionGone}</div>
              )}
              <p>{compare.name}</p>
            </div>
            <div>
              <span className="eyebrow">{t.current}</span>
              <Garment
                variant={v}
                side={side}
                assets={p.assets}
                label={t.current}
              />
              <p>
                {v[side].width} cm / {v[side].angle}°
              </p>
            </div>
          </div>
          <button
            className="button dark"
            onClick={() => {
              if (window.confirm(t.restoreConfirm)) {
                commit(clone(compare.snapshot));
                setSelected(compare.snapshot.variants[0].id);
                setCompare(null);
              }
            }}
          >
            {t.restore}
            <RotateCcw size={16} />
          </button>
        </Modal>
      )}
      {pending && (
        <Modal title={t.resetTitle} onClose={() => setPending(null)}>
          <p className="eyebrow">SELVEDGE / NEW STUDY</p>
          <h2>{t.resetTitle}</h2>
          <p className="modal-desc">{t.resetBody}</p>
          <div className="dialog-actions">
            <button
              className="button outlined"
              onClick={() => {
                exportProject(pruneAssets(p));
                setNotice(t.ready);
              }}
            >
              {t.project}
              <Download size={16} />
            </button>
            <button
              className="button dark"
              onClick={() => replaceStudy(pending)}
            >
              {t.confirm}
              <ArrowRight size={16} />
            </button>
            <button className="text-button" onClick={() => setPending(null)}>
              {t.cancel}
            </button>
          </div>
        </Modal>
      )}
      {showPrivacy && (
        <Modal title={t.privacyTitle} onClose={() => setShowPrivacy(false)}>
          <p className="eyebrow">SELVEDGE / LOCAL BY DESIGN</p>
          <h2>{t.privacyTitle}</h2>
          <p className="modal-desc">{t.privacyBody}</p>
          <p className="modal-desc">{t.about}</p>
          <p className="fine-print">{t.warning}</p>
        </Modal>
      )}
    </>
  );
}
