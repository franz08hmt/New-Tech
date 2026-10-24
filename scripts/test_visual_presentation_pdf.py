"""Check the exported artifact, not just the HTML/CSS source."""
from pathlib import Path
import unittest

import fitz


class VisualPresentationPdfTests(unittest.TestCase):
    def test_pdf_keeps_all_fifteen_landscape_pages_and_key_content(self):
        path = Path(__file__).resolve().parents[1] / "docs/submission/ExaMate-Presentation-Visual-20261025.pdf"
        with fitz.open(path) as deck:
            self.assertEqual(len(deck), 15)
            for page in deck:
                self.assertAlmostEqual(page.rect.width / page.rect.height, 16 / 9, places=3)
            for index, content in [(1, "A TRACEABLE"), (5, "No qualifying evidence"),
                                   (7, "No AI call"), (9, "120 s inference"),
                                   (13, "Hosted identity")]:
                with self.subTest(slide=index + 1):
                    self.assertIn(content, deck[index].get_text())
            self.assertTrue(any("Poppins" in font[3] for font in deck[0].get_fonts()))


if __name__ == "__main__":
    unittest.main()
