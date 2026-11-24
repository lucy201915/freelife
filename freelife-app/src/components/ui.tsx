import { useState, type CSSProperties, type ReactNode } from "react";
import { C, type IconName } from "../lib/theme";

export function Image({
  src,
  alt = "",
  fit = "cover",
  height,
  width,
  style,
  loading = "lazy",
  decoding = "async",
  fetchPriority,
  onError,
  ...rest
}: {
  src: string;
  alt?: string;
  fit?: "cover" | "contain" | "fill" | "none";
  height?: number | string;
  width?: number | string;
  style?: CSSProperties;
  loading?: "lazy" | "eager";
  decoding?: "async" | "auto" | "sync";
  fetchPriority?: "high" | "low" | "auto";
  onError?: () => void;
  [key: string]: unknown;
}) {
  const resolved =
    typeof src === "string" && src.startsWith("asset:") ? "/images/" + src.slice("asset:".length) : src;
  return (
    <img
      {...rest}
      src={resolved}
      alt={alt}
      loading={loading}
      decoding={decoding}
      {...(fetchPriority ? { fetchPriority } : {})}
      onError={onError}
      width={typeof width === "number" ? width : undefined}
      height={typeof height === "number" ? height : undefined}
      style={{
        display: "block",
        width: width ?? "100%",
        height,
        objectFit: fit,
        objectPosition: "center",
        ...style,
      }}
    />
  );
}

export function Icon({ name, size = 22, color = C.forest }: { name: IconName; size?: number; color?: string }) {
  const p = { fill: "none", stroke: color, strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, ReactNode> = {
    megaphone: <><path d="M3 10v4h3l7 4V6L6 10H3z" {...p} /><path d="M17 9a4 4 0 0 1 0 6" {...p} /></>,
    pen: <><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" {...p} /><path d="M14 6l3 3" {...p} /></>,
    handshake: <><path d="M3 12l4-4 4 3 3-3 7 5" {...p} /><path d="M7 14l3 3 2-1 2 2 3-3" {...p} /></>,
    gear: <><circle cx="12" cy="12" r="3.2" {...p} /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" {...p} /></>,
    scale: <><path d="M12 4v16M7 20h10M5 7h14" {...p} /><path d="M5 7l-2.5 6h5L5 7zM19 7l-2.5 6h5L19 7z" {...p} /></>,
    code: <><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" {...p} /></>,
    doc: <><path d="M6 3h8l4 4v14H6z" {...p} /><path d="M14 3v4h4M9 12h6M9 16h6" {...p} /></>,
    chart: <><path d="M4 20V4M4 20h16" {...p} /><path d="M8 16v-4M12 16V8M16 16v-6" {...p} /></>,
    shield: <><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" {...p} /><path d="M9 12l2 2 4-4" {...p} /></>,
    tag: <><path d="M3 12V4h8l10 10-8 8L3 12z" {...p} /><circle cx="7.5" cy="8.5" r="1.3" {...p} /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" {...p} /><path d="M8 10V7a4 4 0 0 1 8 0v3" {...p} /></>,
    flex: <><path d="M4 8h12l-3-3M20 16H8l3 3" {...p} /></>,
    search: <><circle cx="11" cy="11" r="6.5" {...p} /><path d="M16 16l4.5 4.5" {...p} /></>,
    star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z" fill={color} stroke="none" />,
    check: <path d="M5 12.5l4.2 4.2L19 7" {...p} />,
    clock: <><circle cx="12" cy="12" r="8.5" {...p} /><path d="M12 7.5V12l3 2" {...p} /></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16" {...p} />,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" {...p} />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>{paths[name]}</svg>;
}

export function Leaf({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill={C.forest} />
      <path d="M9 23c0-8 5-13 14-14-1 9-6 14-14 14z" fill={C.sageLight} />
      <path d="M9.5 22.5L18 14" stroke={C.forest} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function AvatarFallback({ alt, height, initials }: { alt: string; height: number; initials?: string }) {
  const label = (initials || "").trim();
  const badge = Math.min(112, Math.max(40, Math.round(height * 0.38)));
  return (
    <div
      role="img"
      aria-label={alt}
      style={{
        height,
        width: "100%",
        display: "grid",
        placeItems: "center",
        background: `linear-gradient(165deg, ${C.forest} 0%, ${C.forest2} 100%)`,
      }}
    >
      {label ? (
        <span
          style={{
            width: badge,
            height: badge,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            background: C.ivory,
            color: C.forest,
            fontWeight: 800,
            fontSize: Math.max(15, Math.round(badge * 0.34)),
            letterSpacing: "0.02em",
            boxShadow: "0 0 0 6px rgba(201,213,188,.45)",
          }}
        >
          {label}
        </span>
      ) : (
        <svg width={badge} height={badge} viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="30" fill={C.ivory} />
          <circle cx="32" cy="26" r="10" fill={C.forest} />
          <path d="M14 54c2.8-10 10.2-15 18-15s15.2 5 18 15" fill={C.forest} />
        </svg>
      )}
    </div>
  );
}

export function Photo({ src, alt, height, radius = 20, initials, priority = false }: { src: string; alt: string; height: number; radius?: number; initials?: string; priority?: boolean }) {
  const photo = src.trim();
  const [failedSrc, setFailedSrc] = useState("");
  const broken = Boolean(photo) && failedSrc === photo;
  return (
    <div style={{ borderRadius: radius, overflow: "hidden", background: C.sageMist, lineHeight: 0, position: "relative" }}>
      {photo && !broken ? (
        <Image
          src={photo}
          alt={alt}
          fit="cover"
          height={height}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "auto" : "async"}
          fetchPriority={priority ? "high" : undefined}
          onError={() => setFailedSrc(photo)}
        />
      ) : (
        <AvatarFallback alt={alt} height={height} initials={initials} />
      )}
    </div>
  );
}

export function Stars({ value, reviews }: { value: number; reviews?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, color: C.ink2 }}>
      <Icon name="star" size={16} color={C.gold} />
      <b style={{ color: C.ink, fontWeight: 600 }}>{Number(value || 0).toFixed(1)}</b>
      {typeof reviews === "number" ? <span style={{ color: C.ink3 }}>（{reviews}）</span> : null}
    </span>
  );
}

export function initialsOf(name: string): string {
  const chars = Array.from(name.replace(/\s+/g, "")).slice(0, 2);
  return chars.join("") || "專";
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 13, letterSpacing: ".16em", color: C.forest2, fontWeight: 600, marginBottom: 12 }}>{children}</div>;
}

export function SecHead({ eyebrow, title, sub, right, as = "h2" }: { eyebrow: string; title: string; sub?: string; right?: ReactNode; as?: "h1" | "h2" }) {
  const Heading = as;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 20, marginBottom: 40 }}>
      <div style={{ flex: "1 1 320px", minWidth: 0 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Heading className="fl-h2" style={{ margin: 0, color: C.ink, fontWeight: 700 }}>{title}</Heading>
        {sub ? <p style={{ margin: "12px 0 0", color: C.ink2, fontSize: 16, lineHeight: 1.7, maxWidth: 620 }}>{sub}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className="fl-chip" onClick={onClick} style={{ border: `1px solid ${active ? C.forest : C.line}`, background: active ? C.forest : C.white, color: active ? C.ivory : C.ink2, borderRadius: 999, padding: "9px 18px", fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}

export function Field({
  label, value, onChange, type = "text", placeholder, required, textarea, min, error,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
  required?: boolean; textarea?: boolean; min?: number | string; error?: string;
}) {
  const style: CSSProperties = {
    width: "100%", border: `1px solid ${error ? "#B4533C" : C.line}`, borderRadius: 12,
    padding: "12px 14px", fontSize: 15, color: C.ink, background: C.white, fontFamily: "inherit",
  };
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink2, marginBottom: 6 }}>{label}{required ? " *" : ""}</div>
      {textarea ? (
        <textarea className="fl-input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} rows={5} style={{ ...style, resize: "vertical", minHeight: 120 }} />
      ) : (
        <input className="fl-input" type={type} value={value} placeholder={placeholder} min={min} onChange={(e) => onChange(e.target.value)} style={style} />
      )}
      {error ? <div style={{ color: "#B4533C", fontSize: 13, marginTop: 4 }}>{error}</div> : null}
    </label>
  );
}
