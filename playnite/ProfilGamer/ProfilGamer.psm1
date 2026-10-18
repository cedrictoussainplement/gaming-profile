# Envoie la bibliothèque Playnite au profil (POST /api/playnite) : tous les jeux,
# installés ou non, avec leur temps de jeu. Les jeux cachés dans Playnite sont ignorés.
# Joint les succès Epic, EA, Ubisoft… lus par l'extension Playnite Achievements
# (Steam et PlayStation viennent directement de leurs API).
# Envoi automatique au démarrage de Playnite et à la fin de chaque partie,
# ou à la main via le menu Extensions > Profil gamer.
# Réglages dans config.json, à côté de ce fichier (voir config.example.json).

function Get-ProfilConfig {
    $path = Join-Path $CurrentExtensionInstallPath "config.json"
    if (-not (Test-Path $path)) { throw "config.json introuvable dans $CurrentExtensionInstallPath" }
    $config = Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $config.url -or -not $config.key) { throw "config.json doit contenir url et key" }
    return $config
}

# Une ligne de la base de Playnite Achievements (noms de colonnes = noms des propriétés).
$achievementRow = @"
public class ProfilGamerAchievementRow {
    public string ProviderKey { get; set; }
    public string PlayniteGameId { get; set; }
    public string ApiName { get; set; }
    public string DisplayName { get; set; }
    public string Description { get; set; }
    public string UnlockedIconPath { get; set; }
    public int Hidden { get; set; }
    public double? GlobalPercentUnlocked { get; set; }
    public int Unlocked { get; set; }
    public string UnlockTimeUtc { get; set; }
}
"@

$achievementQuery = @"
SELECT g.ProviderKey, g.PlayniteGameId, d.ApiName, d.DisplayName, d.Description, d.UnlockedIconPath, d.Hidden,
       d.GlobalPercentUnlocked, COALESCE(ua.Unlocked, 0) AS Unlocked, ua.UnlockTimeUtc
FROM UserGameProgress p
JOIN Users u ON u.Id = p.UserId AND u.IsCurrentUser = 1
JOIN Games g ON g.Id = p.GameId
JOIN AchievementDefinitions d ON d.GameId = g.Id
LEFT JOIN UserAchievements ua ON ua.UserGameProgressId = p.Id AND ua.AchievementDefinitionId = d.Id
WHERE p.HasAchievements = 1 AND g.PlayniteGameId IS NOT NULL
"@

# Succès par jeu Playnite (clé : Id du jeu), hors Steam et PlayStation.
function Get-ProfilAchievements {
    $byGame = @{}
    $file = Get-ChildItem -Path $PlayniteApi.Paths.ExtensionsDataPath -Filter "achievement_cache.db" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $file) { return $byGame }

    if (-not ("ProfilGamerAchievementRow" -as [type])) { Add-Type -TypeDefinition $achievementRow }
    $db = [Playnite.SDK.Data.SQLite]::OpenDatabase($file.FullName, [Playnite.SDK.Data.SqliteOpenFlags]::ReadOnly)
    try {
        $query = [Playnite.SDK.Data.ISQLite].GetMethod("Query").MakeGenericMethod([ProfilGamerAchievementRow])
        $rows = $query.Invoke($db, @($achievementQuery, [object[]]@()))
    }
    finally {
        if ($db -is [IDisposable]) { $db.Dispose() }
    }

    foreach ($r in $rows) {
        if ($r.ProviderKey -match "steam|playstation|psn") { continue }
        $unlockedAt = $null
        if ($r.Unlocked) {
            $unlockedAt = "1970-01-01T00:00:00.000Z"
            $parsed = [datetime]::MinValue
            if ($r.UnlockTimeUtc -and [datetime]::TryParse($r.UnlockTimeUtc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]"AdjustToUniversal,AssumeUniversal", [ref]$parsed) -and $parsed.Year -gt 1970) {
                $unlockedAt = $parsed.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            }
        }
        $key = ([string]$r.PlayniteGameId).ToLowerInvariant()
        if (-not $byGame.ContainsKey($key)) { $byGame[$key] = New-Object System.Collections.ArrayList }
        [void]$byGame[$key].Add(@{
                id          = $r.ApiName
                name        = if ($r.DisplayName) { $r.DisplayName } else { $r.ApiName }
                description = $r.Description
                icon        = if ($r.UnlockedIconPath -like "https://*") { $r.UnlockedIconPath } else { $null }
                hidden      = [bool]$r.Hidden
                unlockedAt  = $unlockedAt
                rarity      = $r.GlobalPercentUnlocked
            })
    }
    return $byGame
}

function Send-ProfilHours {
    param($scriptMainMenuItemActionArgs, [switch]$Silent)
    try {
        $config = Get-ProfilConfig
        $achievements = @{}
        $achievementNote = ""
        try { $achievements = Get-ProfilAchievements }
        catch {
            $err = $_.Exception
            while ($err.InnerException) { $err = $err.InnerException }
            $achievementNote = " (succès illisibles : $($err.Message))"
        }
        $games = @(
            $PlayniteApi.Database.Games | Where-Object { -not $_.Hidden } | ForEach-Object {
                $entry = @{
                    id           = if ($_.GameId) { [string]$_.GameId } else { [string]$_.Id }
                    name         = $_.Name
                    source       = if ($_.Source) { $_.Source.Name } else { $null }
                    playtime     = [double]$_.Playtime
                    lastActivity = if ($_.LastActivity) { ([datetime]$_.LastActivity).ToUniversalTime().ToString("o") } else { $null }
                }
                $list = $achievements[$_.Id.ToString().ToLowerInvariant()]
                if ($list) { $entry.achievements = @($list) }
                $entry
            }
        )
        $withAchievements = @($games | Where-Object { $_.achievements }).Count
        $body = @{ games = $games } | ConvertTo-Json -Depth 6 -Compress

        # PowerShell 5.1 n'active pas toujours TLS 1.2, exigé par Cloudflare.
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $response = Invoke-RestMethod -Method Post -Uri $config.url `
            -Headers @{ Authorization = "Bearer $($config.key)" } `
            -ContentType "application/json; charset=utf-8" `
            -Body ([Text.Encoding]::UTF8.GetBytes($body))

        $failed = @($response.results | Where-Object { -not $_.ok })
        $updated = [int](@($response.results | ForEach-Object { [int]$_.achievements }) | Measure-Object -Sum).Sum
        $message = "Profil gamer : $($games.Count) jeux envoyés, dont $withAchievements avec succès ($updated mis à jour sur le site)$achievementNote"
        if ($failed.Count) { $message += ", erreurs : " + (($failed | ForEach-Object { "$($_.account) ($($_.error))" }) -join ", ") }
        $__logger.Info($message)
        # Trace du dernier envoi (sans la clé), lisible pour le dépannage.
        Set-Content -Path (Join-Path $CurrentExtensionInstallPath "dernier-envoi.txt") -Value "$((Get-Date).ToString('s')) $message" -Encoding UTF8
        if (-not $Silent) { $PlayniteApi.Dialogs.ShowMessage($message) }
    }
    catch {
        $__logger.Error("Profil gamer : $($_.Exception.Message)")
        Set-Content -Path (Join-Path $CurrentExtensionInstallPath "dernier-envoi.txt") -Value "$((Get-Date).ToString('s')) erreur : $($_.Exception.Message)" -Encoding UTF8
        $PlayniteApi.Notifications.Add("ProfilGamer", "Profil gamer : envoi des heures impossible ($($_.Exception.Message))", [Playnite.SDK.NotificationType]::Error)
    }
}

function OnApplicationStarted() {
    Send-ProfilHours -Silent
}

function OnGameStopped() {
    param($evnArgs)
    Send-ProfilHours -Silent
}

function GetMainMenuItems {
    param($getMainMenuItemsArgs)
    $item = New-Object Playnite.SDK.Plugins.ScriptMainMenuItem
    $item.Description = "Envoyer mes heures au profil"
    $item.FunctionName = "Send-ProfilHours"
    $item.MenuSection = "@Profil gamer"
    return $item
}
