# rebuild216 installer — Windows / PowerShell.
#   irm https://next-app-maaref.vercel.app/cli/install.ps1 | iex
$ErrorActionPreference = "Stop"

$Base = if ($env:REBUILD_URL) { $env:REBUILD_URL } else { "https://next-app-maaref.vercel.app" }
$Dir  = if ($env:REBUILD216_DIR) { $env:REBUILD216_DIR } else { "$HOME\.rebuild216\bin" }

Write-Host "Installing rebuild216 from $Base ..."
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
foreach ($f in "rebuild216.mjs", "mcp-rebuild.mjs", "package.json", "README.md") {
  Invoke-WebRequest -UseBasicParsing "$Base/cli/$f" -OutFile (Join-Path $Dir $f)
}

Push-Location $Dir
npm install --silent
npm install -g . --silent
Pop-Location

Write-Host ""
Write-Host "rebuild216 installed."
Write-Host "Next steps:"
Write-Host "  1) claude login                       # your Anthropic account (subscription)"
Write-Host "  2) `$env:GITHUB_TOKEN='ghp_...'        # to clone/push the project repo"
Write-Host "  3) rebuild216 login                   # email + password -> token"
Write-Host "  4) rebuild216 ""Project name""           # run the agent; /push at the end"
