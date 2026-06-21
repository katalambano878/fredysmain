'use client';

import { useEffect } from 'react';

const SITE_NAME = "Freby’s Fashion GH";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title
      ? `${title} | ${SITE_NAME}`
      : `${SITE_NAME} | Kids Ready-to-Wear Outfits`;
  }, [title]);
}
