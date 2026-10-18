# Envoie la bibliothèque Playnite au profil (POST /api/playnite) : tous les jeux,
# installés ou non, avec leur temps de jeu. Les jeux cachés dans Playnite sont ignorés.
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

function Send-ProfilHours {
    param($scriptMainMenuItemActionArgs, [switch]$Silent)
    try {
        $config = Get-ProfilConfig
        $games = @(
            $PlayniteApi.Database.Games | Where-Object { -not $_.Hidden } | ForEach-Object {
                @{
                    id           = if ($_.GameId) { [string]$_.GameId } else { [string]$_.Id }
                    name         = $_.Name
                    source       = if ($_.Source) { $_.Source.Name } else { $null }
                    playtime     = [double]$_.Playtime
                    lastActivity = if ($_.LastActivity) { ([datetime]$_.LastActivity).ToUniversalTime().ToString("o") } else { $null }
                }
            }
        )
        $body = @{ games = $games } | ConvertTo-Json -Depth 4 -Compress

        # PowerShell 5.1 n'active pas toujours TLS 1.2, exigé par Cloudflare.
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $response = Invoke-RestMethod -Method Post -Uri $config.url `
            -Headers @{ Authorization = "Bearer $($config.key)" } `
            -ContentType "application/json; charset=utf-8" `
            -Body ([Text.Encoding]::UTF8.GetBytes($body))

        $failed = @($response.results | Where-Object { -not $_.ok })
        $message = "Profil gamer : $($games.Count) jeux envoyés"
        if ($failed.Count) { $message += ", erreurs : " + (($failed | ForEach-Object { "$($_.account) ($($_.error))" }) -join ", ") }
        $__logger.Info($message)
        if (-not $Silent) { $PlayniteApi.Dialogs.ShowMessage($message) }
    }
    catch {
        $__logger.Error("Profil gamer : $($_.Exception.Message)")
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
