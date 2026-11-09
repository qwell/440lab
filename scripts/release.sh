#!/usr/bin/env bash

usage() {
    cat <<'EOF'
Usage: yarn release VERSION

Update release metadata, commit it, and create an annotated vVERSION tag.
The working tree must be clean. This command does not push the commit or tag.
EOF
}

if [[ ${1:-} == '-h' || ${1:-} == '--help' ]]; then
    usage
    exit 0
fi

if [[ $# -ne 1 ]]; then
    usage >&2
    exit 1
fi

version=${1#v}
tag="v$version"

if [[ -n $(git status --short) ]]; then
    echo 'The working tree must be clean before making a release.' >&2
    exit 1
fi

if [[ -n $(git tag --list "$tag") ]]; then
    echo "Tag $tag already exists locally." >&2
    exit 1
fi

if [[ -n $(git ls-remote --tags origin "$tag") ]]; then
    echo "Tag $tag already exists on origin." >&2
    exit 1
fi

node scripts/release.js "$version"
yarn hygiene
git diff --check package.json site/index.html
git add package.json site/index.html
git commit -m "Release $tag"
git tag "$tag"

echo "Created release commit and tag $tag."
echo "Review them, then push with: git push origin HEAD $tag"
