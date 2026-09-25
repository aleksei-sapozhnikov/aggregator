<#
.SYNOPSIS
Find local branches that were already merged into main by squash merge.

.DESCRIPTION
The script checks each local branch except main and the current branch. For each
branch it creates a temporary detached worktree at main, squash-merges the
branch there, and treats the branch as deletable only when that produces no
staged or working tree diff.

After showing the deletable branches, it asks for confirmation. Only the exact
answer "yes" deletes branches.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Runs git and returns stdout/stderr. Non-zero exit codes are treated as errors.
function Get-GitOutput {
    param(
        [Parameter(Mandatory = $true)]
        [string[]] $Arguments
    )

    $output = & git @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE.`n$output"
    }

    return $output
}

# Runs git while discarding output. Some git commands use meaningful non-zero
# exit codes, so callers can pass the allowed set explicitly.
function Invoke-GitQuiet {
    param(
        [Parameter(Mandatory = $true)]
        [string[]] $Arguments,
        [int[]] $AllowedExitCodes = @(0)
    )

    & git @Arguments *> $null
    $exitCode = $LASTEXITCODE
    if ($AllowedExitCodes -notcontains $exitCode) {
        throw "git $($Arguments -join ' ') failed with exit code $exitCode."
    }

    return $exitCode
}

# Returns the first output line trimmed, or an empty string when git produced no
# output. This keeps command-output parsing explicit at call sites.
function Get-FirstTrimmedLine {
    param(
        [object[]] $Lines
    )

    if ($Lines.Count -eq 0) {
        return ""
    }

    return ([string] $Lines[0]).Trim()
}

$repo = Get-FirstTrimmedLine (Get-GitOutput @("rev-parse", "--show-toplevel"))
$currentBranch = Get-FirstTrimmedLine (Get-GitOutput @("-C", $repo, "branch", "--show-current"))
$baseBranch = "main"
$baseSha = Get-FirstTrimmedLine (Get-GitOutput @("-C", $repo, "rev-parse", $baseBranch))
$temporaryWorktree = Join-Path ([System.IO.Path]::GetTempPath()) "git-prune-$([guid]::NewGuid())"

$candidates = @()

# The temporary worktree keeps the real checkout untouched while testing squash
# merges. Each branch starts from the same main commit.
try {
    Invoke-GitQuiet @("-C", $repo, "worktree", "add", "--detach", $temporaryWorktree, $baseSha, "--quiet") | Out-Null

    $branches = Get-GitOutput @("-C", $repo, "for-each-ref", "refs/heads", "--format=%(refname:short)")
    foreach ($branch in $branches) {
        if ($branch -eq $baseBranch -or ($currentBranch -and $branch -eq $currentBranch)) {
            continue
        }

        Invoke-GitQuiet @("-C", $temporaryWorktree, "reset", "--hard", $baseSha, "--quiet") | Out-Null
        Invoke-GitQuiet @("-C", $temporaryWorktree, "clean", "-fd", "--quiet") | Out-Null

        $mergeExitCode = Invoke-GitQuiet `
            @("-C", $temporaryWorktree, "merge", "--squash", "--no-commit", $branch) `
            -AllowedExitCodes @(0, 1)
        if ($mergeExitCode -ne 0) {
            continue
        }

        $cachedDiffExitCode = Invoke-GitQuiet `
            @("-C", $temporaryWorktree, "diff", "--cached", "--quiet") `
            -AllowedExitCodes @(0, 1)
        $worktreeDiffExitCode = Invoke-GitQuiet `
            @("-C", $temporaryWorktree, "diff", "--quiet") `
            -AllowedExitCodes @(0, 1)

        if ($cachedDiffExitCode -eq 0 -and $worktreeDiffExitCode -eq 0) {
            $candidates += $branch
        }
    }
}
finally {
    if ($temporaryWorktree -and (Test-Path -LiteralPath $temporaryWorktree)) {
        & git -C $repo worktree remove --force $temporaryWorktree *> $null
    }
}

if ($candidates.Count -eq 0) {
    Write-Host "No squashed local branches can be safely deleted."
    exit 0
}

Write-Host "These branches were merged and can be deleted:"
Write-Host ""
foreach ($branch in $candidates) {
    Write-Host "  $branch"
}

Write-Host ""
$confirmation = Read-Host "Delete these branches? Type yes to proceed"
if ($confirmation -ne "yes") {
    Write-Host "No branches were deleted."
    exit 0
}

foreach ($branch in $candidates) {
    Write-Host "Deleting local branch: $branch"
    Invoke-GitQuiet @("-C", $repo, "branch", "-D", "--", $branch) | Out-Null
}
