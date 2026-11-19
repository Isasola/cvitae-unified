from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

import bumeran_pe
import computrabajo_pe


class PeruSourceTruthTests(unittest.TestCase):
    def test_bumeran_does_not_infer_location_or_country_from_portal(self) -> None:
        html = """
        <article data-qa="posting-list-item">
          <h2><a href="/empleos/role-123">Analista de datos</a></h2>
          <span data-qa="company-name">Empresa de ejemplo</span>
        </article>
        """
        with patch.object(bumeran_pe, "fetch", return_value=html), patch.object(bumeran_pe.time, "sleep"):
            rows = bumeran_pe.scrape_category("data", "Datos", max_pages=1)
        self.assertEqual(1, len(rows))
        self.assertEqual("", rows[0]["location"])
        self.assertNotIn("country_code", rows[0])
        self.assertEqual("https://www.bumeran.com.pe/empleos/role-123", rows[0]["source_url"])

    def test_computrabajo_does_not_infer_location_or_country_from_portal(self) -> None:
        html = """
        <article class="box_offer">
          <h2><a class="js-o-link" href="/ofertas/role-123">Analista de datos</a></h2>
          <p><a href="/empresas/example">Empresa de ejemplo</a></p>
        </article>
        """
        with patch.object(computrabajo_pe, "FETCH_DETAILS", False), \
             patch.object(computrabajo_pe, "fetch", return_value=html), \
             patch.object(computrabajo_pe.time, "sleep"):
            rows = computrabajo_pe.scrape_category("datos", "Datos", max_pages=1)
        self.assertEqual(1, len(rows))
        self.assertEqual("", rows[0]["location"])
        self.assertNotIn("country_code", rows[0])
        self.assertEqual("https://pe.computrabajo.com/ofertas/role-123", rows[0]["source_url"])


if __name__ == "__main__":
    unittest.main()
