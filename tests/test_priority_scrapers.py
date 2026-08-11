from __future__ import annotations

import sys
import unittest
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

import fiuna_job_board_scraper as fiuna
import mef_inapp_becas_scraper as mef


class MefInappParserTest(unittest.TestCase):
    def test_keeps_only_active_structured_scholarships(self) -> None:
        html = """
        <div class="card bg-card"><div class="card-body">
          <a href="/cooperacion/beca/datalle1/activo"><h6>Beca vigente</h6></a>
          <p><strong>JICA</strong></p><div class="d-flex">
            <h6><b>Financiamiento:</b><strong>TOTAL</strong></h6>
            <h6><b>Nivel:</b><strong>POST-GRADO</strong></h6>
            <h6><b>Lugar:</b><strong>JAPÓN</strong></h6>
            <h6><b>Límite de postulación:</b><strong>28/08/2026 15:00</strong></h6>
          </div></div><a class="btnPostular" href="/cooperacion/postulacion/new1/">Postular</a>
        </div>
        <div class="card bg-card"><div class="card-body">
          <a href="/cooperacion/beca/datalle2/finalizado"><h6>Beca vencida</h6></a>
          <p><strong>KOICA</strong></p><div class="d-flex">
            <h6><b>Límite de postulación:</b><strong>01/01/2026 10:00</strong></h6>
          </div></div>
        </div>
        """
        rows = mef.parse(html, now=datetime(2026, 8, 11))
        self.assertEqual(1, len(rows))
        self.assertEqual("Beca vigente", rows[0]["title"])
        self.assertTrue(rows[0]["fully_funded"])
        self.assertEqual("https://becas.mef.gov.py/cooperacion/postulacion/new1/", rows[0]["application_url"])


class FiunaParserTest(unittest.TestCase):
    def test_extracts_recent_job_and_rejects_old_entries(self) -> None:
        html = """
        <details class="e-n-accordion-item" id="job-1">
          <summary><h5>Empresa Uno busca Ingeniero/a</h5></summary>
          <div role="region"><p>Requisitos técnicos</p><a href="mailto:jobs@example.com">jobs@example.com</a>
          <p>Publicado el 11 de Agosto del 2026</p></div>
        </details>
        <details class="e-n-accordion-item" id="job-2">
          <summary><h5>Empresa Dos busca Analista</h5></summary>
          <div role="region"><p>Publicado el 01 de Enero del 2025</p></div>
        </details>
        """
        rows = fiuna.parse(html, now=datetime(2026, 8, 11))
        self.assertEqual(1, len(rows))
        self.assertEqual("Empresa Uno", rows[0]["organization"])
        self.assertEqual("aggregator", rows[0]["source_authority"])
        self.assertFalse(rows[0]["original_source_verified"])
        self.assertTrue(rows[0]["application_url"].endswith("#job-1"))


if __name__ == "__main__":
    unittest.main()
