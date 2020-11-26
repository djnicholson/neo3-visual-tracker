import React from "react";

type Props = {
  children: any;
  grow?: boolean;
  title: string;
};

export default function MetadataBadge({ children, grow, title }: Props) {
  const style: React.CSSProperties = {
    textAlign: "right",
    margin: 5,
  };
  const titleStyle: React.CSSProperties = {
    fontWeight: "bold",
    fontSize: "0.6rem",
    textTransform: "uppercase",
    marginBottom: 2,
  };
  const badgeStyle: React.CSSProperties = {
    backgroundColor: "var(--vscode-badge-background)",
    color: "var(--vscode-badge-foreground)",
    borderRadius: "10px 0 0 10px",
    padding: 5,
    maxHeight: grow ? undefined : "3em",
    overflow: grow ? undefined : "auto",
  };
  return (
    <div style={style}>
      <div style={titleStyle}>{title}</div>
      <div style={badgeStyle}>{children}</div>
    </div>
  );
}
