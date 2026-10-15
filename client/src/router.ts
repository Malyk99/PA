import { useEffect, useState } from "react";

export function useRoute(): string[] {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => {
      setHash(location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash.replace(/^#\/?/, "").split("?")[0].split("/").filter(Boolean);
}

export function go(path: string) {
  location.hash = path.startsWith("/") ? path : `/${path}`;
}
