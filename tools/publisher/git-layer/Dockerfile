# Build Git and its HTTPS helper against the Lambda Python 3.12 AL2023 image.
FROM public.ecr.aws/lambda/python:3.12

RUN dnf install -y git-core && dnf clean all

# Keep diagnostics in separate image steps to identify missing AL2023 tools.
RUN set -eux; \
    git --version; \
    git --exec-path; \
    command -v ldd; \
    test -f "$(git --exec-path)/git-remote-https"

RUN set -eux; \
    mkdir -p /layer/bin /layer/lib /layer/libexec/git-core; \
    cp -L "$(command -v git)" /layer/bin/git; \
    cp -L "$(git --exec-path)/git-remote-https" /layer/libexec/git-core/git-remote-https; \
    /layer/bin/git --version

# Capture transitive native dependencies of Git and its HTTPS helper.
RUN set -eux; \
    ldd /layer/bin/git > /tmp/git-libs; \
    ldd /layer/libexec/git-core/git-remote-https >> /tmp/git-libs; \
    cat /tmp/git-libs; \
    awk '{ if (substr($3,1,1)=="/") print $3; else if (substr($1,1,1)=="/") print $1; }' /tmp/git-libs \
      | sort -u \
      | while IFS= read -r library; do \
          cp -L "$library" "/layer/lib/$(basename "$library")"; \
        done; \
    test -n "$(ls -A /layer/lib)"
