"use client";

import { translateCatalogText } from "@/lib/catalogI18n";
import { useTranslation } from "@/components/useTranslation";

type Props = {
  text: string;
  kind?: "name" | "color" | "description" | "dimension" | "material" | "packaging" | "rebound" | "general";
};

export function CatalogText({ text, kind = "general" }: Props) {
  const { language } = useTranslation();
  return <>{translateCatalogText(text, language, kind)}</>;
}
