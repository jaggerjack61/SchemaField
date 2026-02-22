param(
    [Parameter(Position=0)]
    [string]$Message
)

if ([string]::IsNullOrWhiteSpace($Message)) {
    git status
} else {
    git add .
    git commit -m $Message
    git push
}
