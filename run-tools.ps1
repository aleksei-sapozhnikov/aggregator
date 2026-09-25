<#
.SYNOPSIS
Repository-local command runner.

.DESCRIPTION
This script is the single PowerShell entry point for small repository tools.
It keeps root-level tab completion predictable while allowing the actual tool
implementations to live under tools/powershell.

Run without arguments to list available commands.
#>

param(
    [Parameter(Position = 0)]
    [string] $Command,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $ToolArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$runner = ".\$($MyInvocation.MyCommand.Name)"

# Add new repository commands here. Each entry points to the script that owns
# the command behavior and provides short help text for the runner.
$commands = @{
    "prune-branches" = @{
        Script = "tools\powershell\Prune-LocalBranches.ps1"
        Description = "Find squashed local branches and offer to delete them."
        Examples = @(
            "$runner prune-branches"
        )
    }
}

if ($null -eq $ToolArgs -or ($ToolArgs.Count -eq 1 -and $ToolArgs[0] -eq "")) {
    $ToolArgs = @()
}

# Prints the command list shown by .\run-tools.ps1 and global help flags.
function Show-Usage {
    Write-Host "Usage:"
    Write-Host "  $runner <command> [args]"
    Write-Host ""
    Write-Host "Commands:"

    foreach ($name in ($commands.Keys | Sort-Object)) {
        Write-Host "  $name"
        Write-Host "    $($commands[$name]["Description"])"
    }
}

# Prints usage examples for one concrete command, for example:
# .\run-tools.ps1 prune-branches --help
function Show-CommandHelp {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name
    )

    Write-Host "Usage:"
    foreach ($example in $commands[$Name]["Examples"]) {
        Write-Host "  $example"
    }
}

if ([string]::IsNullOrWhiteSpace($Command) -or $Command -eq "help" -or $Command -eq "-h" -or $Command -eq "--help") {
    Show-Usage
    exit 0
}

if (-not $commands.ContainsKey($Command)) {
    Write-Error "Unknown command: $Command"
    Show-Usage
    exit 1
}

if ($ToolArgs.Count -eq 1 -and ($ToolArgs[0] -eq "help" -or $ToolArgs[0] -eq "-h" -or $ToolArgs[0] -eq "--help")) {
    Show-CommandHelp $Command
    exit 0
}

$scriptPath = Join-Path $PSScriptRoot $commands[$Command]["Script"]
$powerShellPath = (Get-Process -Id $PID).Path
& $powerShellPath -NoProfile -File $scriptPath @ToolArgs
exit $LASTEXITCODE
