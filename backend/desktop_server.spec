# PyInstaller recipe for the backend inside the Windows app:  python -m PyInstaller desktop_server.spec
# Output: dist/desktop-server/ (a folder with desktop-server.exe), which electron-builder copies into the installer.
from PyInstaller.utils.hooks import collect_submodules

hidden = (
    collect_submodules("uvicorn")       # loads its protocol and loop classes by name at runtime
    + collect_submodules("src")         # routes and playbooks are imported per mode
    + collect_submodules("langgraph")
)

analysis = Analysis(
    ["desktop_server.py"],
    pathex=["."],
    datas=[("src/db/sqlite_schema.sql", "src/db")],
    hiddenimports=hidden,
    excludes=["tkinter", "unittest", "pytest", "IPython", "matplotlib", "pandas", "numpy.tests"],
    noarchive=False,
)
pyz = PYZ(analysis.pure)
exe = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="desktop-server",
    console=False,          # no black window; Electron reads its health endpoint instead
    upx=False,
)
COLLECT(exe, analysis.binaries, analysis.datas, name="desktop-server", upx=False)
