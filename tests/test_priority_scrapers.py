from __future__ import annotations

import sys
import unittest
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

import fiuna_job_board_scraper as fiuna
import mef_inapp_becas_scraper as mef
import mitic_opportunities_scraper as mitic
import snj_paraguay_scraper as snj
import ipa_convocatorias_scraper as ipa
import aecid_paraguay_calls_scraper as aecid
import wwf_paraguay_calls_scraper as wwf


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


class MiticParserTest(unittest.TestCase):
    def test_keeps_only_recent_open_official_calls(self) -> None:
        posts = [
            {
                "date": "2026-08-01T09:00:00",
                "modified": "2026-08-02T09:00:00",
                "link": "https://mitic.gov.py/analista-en-convocatoria/",
                "title": {"rendered": "Analista de datos – En Convocatoria"},
                "content": {"rendered": '<p>Objetivo y requisitos.</p><a href="https://postulaciones.mitic.gov.py/login">Postulá aquí</a>'},
            },
            {
                "date": "2026-08-01T09:00:00",
                "modified": "2026-08-02T09:00:00",
                "link": "https://mitic.gov.py/puesto-en-evaluacion/",
                "title": {"rendered": "Especialista – En Evaluación"},
                "content": {"rendered": "Proceso cerrado"},
            },
        ]
        rows = mitic.parse(posts, now=datetime(2026, 8, 13))
        self.assertEqual(1, len(rows))
        self.assertEqual("Analista de datos", rows[0]["title"])
        self.assertEqual("https://mitic.gov.py/analista-en-convocatoria/", rows[0]["application_url"])
        self.assertEqual("original", rows[0]["source_authority"])


class SnjParserTest(unittest.TestCase):
    def test_rejects_expired_and_non_actionable_youth_news(self) -> None:
        posts = [
            {
                "date": "2026-08-10T09:00:00",
                "link": "https://snj.gov.py/2023/beca-digital/",
                "title": {"rendered": "SNJ abre convocatoria de becas digitales"},
                "content": {"rendered": '<p>Postulaciones hasta el 30 de agosto de 2026.</p><a href="https://forms.gle/abc123">Formulario</a>'},
            },
            {
                "date": "2026-08-01T09:00:00",
                "link": "https://snj.gov.py/2023/beca-vencida/",
                "title": {"rendered": "Convocatoria de becas vencida"},
                "content": {"rendered": "Inscripciones hasta el 2 de agosto de 2026"},
            },
            {
                "date": "2026-08-10T09:00:00",
                "link": "https://snj.gov.py/2023/feria-de-becas/",
                "title": {"rendered": "Feria de becas para jóvenes"},
                "content": {"rendered": "Más información institucional"},
            },
        ]
        rows = snj.parse(posts, now=datetime(2026, 8, 13))
        self.assertEqual(1, len(rows))
        self.assertEqual("scholarship", rows[0]["opportunity_type"])
        self.assertEqual("https://forms.gle/abc123", rows[0]["application_url"])
        self.assertEqual("2026-08-30T23:59:59", rows[0]["deadline"])


class IpaParserTest(unittest.TestCase):
    def test_discovers_current_year_calls_and_excludes_results(self) -> None:
        html = """
        <section><h2>2026</h2>
          <div><h3>Capital Semilla 8va. Edición 2026</h3><p>Para artesanos del Paraguay.</p><a href="/bases-capital-2026.pdf">Bases</a></div>
          <div><h3>Ganadores Premio Artesanía 2026</h3><p>Resultados.</p></div>
        </section>
        """
        rows = ipa.parse(html, year=2026)
        self.assertEqual(1, len(rows))
        self.assertEqual("seed_capital", rows[0]["opportunity_type"])
        self.assertTrue(rows[0]["original_source_verified"])


class AecidParserTest(unittest.TestCase):
    def test_keeps_recent_actionable_calls_only(self) -> None:
        html = """
        <div><p>Date of publication: 09/07/2026</p><h2>Title of the announcement: Coordinación y Asistencia Técnica</h2><a href="/call/coord">Read more</a></div>
        <div><p>Date of publication: 10/07/2026</p><h2>Title of the announcement: Listado de admitidos y excluidos</h2><a href="/call/results">Read more</a></div>
        """
        rows = aecid.parse(html, now=datetime(2026, 8, 13))
        self.assertEqual(1, len(rows))
        self.assertEqual("consultancy", rows[0]["opportunity_type"])
        self.assertTrue(rows[0]["application_url"].endswith("/call/coord"))


class WwfParserTest(unittest.TestCase):
    def test_discovers_recent_official_consultancies(self) -> None:
        html = """
        <article><a href="/informate/convocatorias/experto-genero">Llamado a Consultoría Regional: Experto en género y participación</a><time>15 Jul 2026</time></article>
        """
        rows = wwf.parse(html, now=datetime(2026, 8, 13))
        self.assertEqual(1, len(rows))
        self.assertEqual("wwf_paraguay_calls", rows[0]["source"])
        self.assertEqual("consultancy", rows[0]["opportunity_type"])


if __name__ == "__main__":
    unittest.main()
