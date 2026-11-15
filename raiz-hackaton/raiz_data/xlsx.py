"""Lector mínimo de .xlsx con la biblioteca estándar (sin openpyxl): hojas → filas de valores."""
import re
import zipfile
from xml.etree import ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
REL = '{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'


def _col(ref):
    letters = re.match(r'[A-Z]+', ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def read(path):
    """{nombre_hoja: [[valor, ...], ...]} con números como float y textos como str."""
    with zipfile.ZipFile(path) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            root = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in root.findall('m:si', NS):
                shared.append(''.join(t.text or '' for t in si.iter(f"{{{NS['m']}}}t")))
        rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels')).iter(REL)}
        book = ET.fromstring(z.read('xl/workbook.xml'))
        sheets = {}
        for sheet in book.find('m:sheets', NS):
            target = rels[sheet.get(f"{{{NS['r']}}}id")].lstrip('/')
            target = target if target.startswith('xl/') else 'xl/' + target
            rows = []
            for row in ET.fromstring(z.read(target)).iter(f"{{{NS['m']}}}row"):
                values = {}
                for cell in row.findall('m:c', NS):
                    v = cell.find('m:v', NS)
                    if v is None:
                        inline = cell.find('m:is', NS)
                        text = ''.join(t.text or '' for t in inline.iter(f"{{{NS['m']}}}t")) if inline is not None else None
                    elif cell.get('t') == 's':
                        text = shared[int(v.text)]
                    elif cell.get('t') in ('str', 'inlineStr'):
                        text = v.text
                    else:
                        try:
                            text = float(v.text)
                        except (TypeError, ValueError):
                            text = v.text
                    values[_col(cell.get('r'))] = text
                if values:
                    rows.append([values.get(i) for i in range(max(values) + 1)])
            sheets[sheet.get('name')] = rows
    return sheets
