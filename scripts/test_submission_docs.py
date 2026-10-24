"""Regression for table backgrounds painted into blank PDF space; no network."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import fitz

SCRIPT = Path(__file__).with_name("build-submission-docs.py")
spec = importlib.util.spec_from_file_location("submission_docs", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SubmissionPdfTests(unittest.TestCase):
    def test_slides_resolve_source_relative_images_in_pptx_and_pdf(self):
        with tempfile.TemporaryDirectory(prefix="examate-slide-assets-") as directory:
            root = Path(directory)
            source = root / "docs"
            assets = source / "assets"
            assets.mkdir(parents=True)
            output = root / "export"
            output.mkdir()
            image = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 80, 40), False)
            image.clear_with(80)
            image.save(str(assets / "evidence.png"))
            slides = [{"title": "Source evidence", "bullets": [],
                       "image": "assets/evidence.png", "notes": ["Retained fixture, not live AI."]}]
            with patch.object(module, "DOCS", source):
                module.build_pptx(slides, output / "deck.pptx", output)
                module.build_slides_pdf(slides, output / "deck.pdf", output)
            pptx = module.Presentation(output / "deck.pptx")
            self.assertEqual(sum(shape.shape_type == 13 for shape in pptx.slides[0].shapes), 1)
            with fitz.open(output / "deck.pdf") as pdf:
                self.assertEqual(len(pdf), 1)
                self.assertEqual(len(pdf[0].get_images()), 1)

    def test_report_resolves_images_relative_to_its_source(self):
        with tempfile.TemporaryDirectory(prefix="examate-report-assets-") as directory:
            root = Path(directory)
            source_dir = root / "docs"
            assets = source_dir / "assets"
            assets.mkdir(parents=True)
            output = root / "export"
            output.mkdir()
            image = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 40, 40), False)
            image.clear_with(51)
            image.save(str(assets / "evidence.png"))
            source = source_dir / "report.md"
            source.write_text("# Report\n\n![Evidence](assets/evidence.png)\n", encoding="utf-8")
            target = output / "report.pdf"
            module.markdown_to_pdf(source, target, output)
            with fitz.open(target) as document:
                self.assertEqual(document.page_count, 1)
                self.assertGreater(len(document[0].get_images()), 0,
                                   "source-relative evidence image must appear in exported PDF")

    def test_no_table_fill_below_last_body_text(self):
        with tempfile.TemporaryDirectory(prefix="examate-pdf-regression-") as directory:
            output = Path(directory)
            module.render_architecture(output)
            target = output / "report.pdf"
            module.markdown_to_pdf(module.DOCS / "REPORT.md", target, output)
            with fitz.open(target) as document:
                self.assertGreaterEqual(document.page_count, 10)
                self.assertLessEqual(document.page_count, 20)
                for number, page in enumerate(document, 1):
                    body = [word for word in page.get_text("words") if word[1] < page.rect.height - 55]
                    if not body:
                        continue
                    last_text = max(word[3] for word in body)
                    stray_fills = [shape for shape in page.get_drawings()
                                   if shape.get("fill") and shape["rect"].width > 250
                                   and shape["rect"].y0 > last_text + 20]
                    self.assertEqual(stray_fills, [], f"table background extends into blank space on page {number}")


if __name__ == "__main__":
    unittest.main()
