# =========================================================
#  Sauvegarde du dossier Webtracker en archive 7z horodatee
# =========================================================

# --- Definition des chemins ---
$sourceDir      = "D:\script\Dice-Forge\Roll20\Webtracker"
$destinationDir = "D:\script\Dice-Forge\Roll20\BCK"
$tempArchive    = Join-Path $destinationDir "webtracker_temp.7z"

# Nombre de jours de retention des anciens backups (0 = desactive)
$retentionDays = 30

# --- Localisation de 7-Zip ---
$7zip = Get-Command "7z.exe" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $7zip) { $7zip = "C:\Program Files\7-Zip\7z.exe" }

if (-not (Test-Path $7zip)) {
    Write-Host "7-Zip introuvable a : $7zip" -ForegroundColor Red
    exit 1
}

# --- Verification du dossier source ---
if (-not (Test-Path $sourceDir)) {
    Write-Host "Dossier source $sourceDir introuvable." -ForegroundColor Red
    exit 1
}

# --- Creation du dossier de destination si absent ---
if (-not (Test-Path $destinationDir)) {
    Write-Host "Creation du dossier de backup $destinationDir..." -ForegroundColor Yellow
    New-Item -Path $destinationDir -ItemType Directory -Force | Out-Null
}

# --- 1. Creation de l'archive directement dans BCK (nom temporaire) ---
Write-Host "Archivage de $sourceDir en cours..." -ForegroundColor Yellow

if (Test-Path $tempArchive) {
    Remove-Item $tempArchive -Force
}

& $7zip a -t7z "$tempArchive" "$sourceDir\*" -mx=5

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erreur lors de la creation de l'archive (code $LASTEXITCODE)." -ForegroundColor Red
    exit 1
}

Write-Host "Archive creee avec succes." -ForegroundColor Green

# --- 2. Renommage de l'archive avec la date/heure du jour ---
$now     = Get-Date
$dateKey = $now.ToString("yyyy-MM-dd_HH'h'mm")
$newName = "backup_du_$dateKey.7z"
$newPath = Join-Path $destinationDir $newName

# Gestion du cas rare ou un backup existe deja pour la meme minute
$suffix = 1
while (Test-Path $newPath) {
    $suffix++
    $newName = "backup_du_$dateKey-$($suffix.ToString('00')).7z"
    $newPath = Join-Path $destinationDir $newName
}

try {
    Rename-Item -Path $tempArchive -NewName $newName -ErrorAction Stop
    Write-Host "Backup enregistre : $newName" -ForegroundColor Cyan
} catch {
    Write-Host "Erreur lors du renommage : $_" -ForegroundColor Red
    exit 1
}

# --- 3. Nettoyage des anciens backups (retention) ---
if ($retentionDays -gt 0) {
    $seuil = $now.AddDays(-$retentionDays)
    $oldFiles = Get-ChildItem -Path $destinationDir -File -Filter "backup_du_*" |
                Where-Object { $_.CreationTime -lt $seuil }

    foreach ($old in $oldFiles) {
        try {
            Remove-Item $old.FullName -Force -ErrorAction Stop
            Write-Host "Ancien backup supprime (retention $retentionDays j) : $($old.Name)" -ForegroundColor DarkGray
        } catch {
            Write-Host "Impossible de supprimer $($old.Name) : $_" -ForegroundColor Red
        }
    }
}

Write-Host "Operation terminee !" -ForegroundColor Green