import { Link } from "react-router-dom";
import { C } from "../lib/theme";

export function Breadcrumbs({ items }: { items: { name: string; to?: string }[] }) {
  return (
    <nav aria-label="麵包屑" style={{ fontSize: 13, color: C.ink3, marginBottom: 18 }}>
      {items.map((item, index) => (
        <span key={`${item.name}-${index}`}>
          {index > 0 ? <span aria-hidden="true"> ／ </span> : null}
          {item.to ? (
            <Link to={item.to} className="fl-link" style={{ color: C.ink3, textDecoration: "none" }}>{item.name}</Link>
          ) : (
            <span aria-current="page">{item.name}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
