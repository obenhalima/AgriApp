from __future__ import annotations

import argparse
import html
import os
import re
import struct
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from xml.sax.saxutils import escape


EMU_PER_INCH = 914400
MAX_IMAGE_WIDTH_IN = 6.1


@dataclass
class Paragraph:
    style: str
    text: str


@dataclass
class ImageBlock:
    alt: str
    path: Path


Block = Paragraph | ImageBlock


def parse_markdown(md_path: Path) -> list[Block]:
    lines = md_path.read_text(encoding="utf-8").splitlines()
    blocks: list[Block] = []

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        image_match = re.match(r"^!\[(.*?)\]\((.*?)\)$", line)
        if image_match:
            alt, rel_path = image_match.groups()
            blocks.append(ImageBlock(alt=alt, path=(md_path.parent / rel_path).resolve()))
            continue

        for prefix, style in (("### ", "Heading3"), ("## ", "Heading2"), ("# ", "Heading1")):
            if line.startswith(prefix):
                blocks.append(Paragraph(style=style, text=line[len(prefix) :].strip()))
                break
        else:
            bullet_match = re.match(r"^[-*]\s+(.*)$", line)
            ordered_match = re.match(r"^\d+\.\s+(.*)$", line)
            if bullet_match:
                blocks.append(Paragraph(style="ListParagraph", text=f"- {bullet_match.group(1).strip()}"))
            elif ordered_match:
                blocks.append(Paragraph(style="ListParagraph", text=line))
            else:
                blocks.append(Paragraph(style="BodyText", text=line))

    return blocks


def parse_png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as f:
        header = f.read(24)
    if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Unsupported PNG file: {path}")
    width, height = struct.unpack(">II", header[16:24])
    return width, height


def image_extent(path: Path) -> tuple[int, int]:
    width_px, height_px = parse_png_size(path)
    max_width_emu = int(MAX_IMAGE_WIDTH_IN * EMU_PER_INCH)
    width_emu = int((width_px / 96) * EMU_PER_INCH)
    height_emu = int((height_px / 96) * EMU_PER_INCH)
    if width_emu > max_width_emu:
        scale = max_width_emu / width_emu
        width_emu = int(width_emu * scale)
        height_emu = int(height_emu * scale)
    return width_emu, height_emu


def run_xml(text: str) -> str:
    escaped = escape(text)
    escaped = re.sub(r"`([^`]+)`", lambda m: f"</w:t></w:r><w:r><w:rPr><w:rStyle w:val=\"CodeInline\"/></w:rPr><w:t xml:space=\"preserve\">{escape(m.group(1))}</w:t></w:r><w:r><w:t>", escaped)
    return escaped


def paragraph_xml(paragraph: Paragraph) -> str:
    return (
        f"<w:p><w:pPr><w:pStyle w:val=\"{paragraph.style}\"/></w:pPr>"
        f"<w:r><w:t xml:space=\"preserve\">{run_xml(paragraph.text)}</w:t></w:r></w:p>"
    )


def image_xml(rel_id: str, doc_pr_id: int, alt: str, width_emu: int, height_emu: int) -> str:
    alt_escaped = escape(alt or "Illustration")
    return f"""
<w:p>
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0"
        xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <wp:extent cx="{width_emu}" cy="{height_emu}"/>
        <wp:docPr id="{doc_pr_id}" name="Image {doc_pr_id}" descr="{alt_escaped}"/>
        <wp:cNvGraphicFramePr>
          <a:graphicFrameLocks noChangeAspect="1"/>
        </wp:cNvGraphicFramePr>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:nvPicPr>
                <pic:cNvPr id="{doc_pr_id}" name="Image {doc_pr_id}" descr="{alt_escaped}"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="{rel_id}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="{width_emu}" cy="{height_emu}"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>
""".strip()


def build_document(blocks: Iterable[Block]) -> tuple[str, list[tuple[str, Path]]]:
    body_parts: list[str] = []
    media: list[tuple[str, Path]] = []
    image_index = 1

    for block in blocks:
        if isinstance(block, Paragraph):
            body_parts.append(paragraph_xml(block))
        else:
            image_name = f"image{image_index}{block.path.suffix.lower()}"
            width_emu, height_emu = image_extent(block.path)
            rel_id = f"rId{image_index}"
            body_parts.append(image_xml(rel_id, image_index, block.alt, width_emu, height_emu))
            media.append((image_name, block.path))
            image_index += 1

    body_parts.append("<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1134\" w:right=\"1134\" w:bottom=\"1134\" w:left=\"1134\" w:header=\"708\" w:footer=\"708\" w:gutter=\"0\"/></w:sectPr>")
    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
 xmlns:v="urn:schemas-microsoft-com:vml"
 xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:w10="urn:schemas-microsoft-com:office:word"
 xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
 xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
 xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
 xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
 xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
 mc:Ignorable="w14 wp14">
  <w:body>
    {''.join(body_parts)}
  </w:body>
</w:document>"""
    return document_xml, media


def document_rels_xml(media: list[tuple[str, Path]]) -> str:
    rels = []
    for index, (name, _) in enumerate(media, start=1):
        rels.append(
            f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{html.escape(name)}"/>'
        )
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  {''.join(rels)}
</Relationships>"""


def content_types_xml(media: list[tuple[str, Path]]) -> str:
    defaults = {
        "rels": "application/vnd.openxmlformats-package.relationships+xml",
        "xml": "application/xml",
        "png": "image/png",
    }
    default_xml = "".join(
        f'<Default Extension="{ext}" ContentType="{content_type}"/>'
        for ext, content_type in defaults.items()
    )
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  {default_xml}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>"""


def root_rels_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"""


def styles_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:sz w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="BodyText">
    <w:name w:val="Body Text"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="BodyText"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:color w:val="17324D"/><w:sz w:val="34"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="BodyText"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:color w:val="28536B"/><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="BodyText"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="140" w:after="40"/></w:pPr>
    <w:rPr><w:b/><w:color w:val="3B647B"/><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph">
    <w:name w:val="List Paragraph"/>
    <w:basedOn w:val="BodyText"/>
    <w:pPr><w:ind w:left="360"/></w:pPr>
  </w:style>
  <w:style w:type="character" w:styleId="CodeInline">
    <w:name w:val="Code Inline"/>
    <w:rPr>
      <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>
      <w:color w:val="334155"/>
      <w:shd w:val="clear" w:fill="E2E8F0"/>
    </w:rPr>
  </w:style>
</w:styles>"""


def app_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Codex</Application>
</Properties>"""


def core_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:dcmitype="http://purl.org/dc/dcmitype/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Guide Utilisateur AgriApp</dc:title>
  <dc:creator>Codex</dc:creator>
</cp:coreProperties>"""


def export_docx(md_path: Path, output_path: Path) -> None:
    blocks = parse_markdown(md_path)
    document_xml, media = build_document(blocks)

    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types_xml(media))
        zf.writestr("_rels/.rels", root_rels_xml())
        zf.writestr("docProps/app.xml", app_xml())
        zf.writestr("docProps/core.xml", core_xml())
        zf.writestr("word/document.xml", document_xml)
        zf.writestr("word/styles.xml", styles_xml())
        zf.writestr("word/_rels/document.xml.rels", document_rels_xml(media))
        for image_name, image_path in media:
            zf.write(image_path, f"word/media/{image_name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export a simple markdown guide to DOCX.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    export_docx(args.input.resolve(), args.output.resolve())
    print(args.output.resolve())


if __name__ == "__main__":
    main()
