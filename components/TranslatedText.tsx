"use client";

import { type TranslationKey } from "@/lib/i18n";
import { useTranslation } from "@/components/useTranslation";

type Props = {
  id: TranslationKey;
};

export function TranslatedText({ id }: Props) {
  const { t } = useTranslation();
  return <>{t(id)}</>;
}
