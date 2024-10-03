FROM node:22 as build-frontend
RUN corepack prepare yarn@stable --activate

WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn
COPY frontend/ .
RUN yarn build

### Build
FROM golang:1.23 AS build-go
ARG GOOS
ARG GOARCH
ARG GOARM

WORKDIR /workspace
COPY go.mod /workspace
COPY go.sum /workspace
RUN go mod download
COPY . /workspace

RUN GOOS=${GOOS} GOARCH=${GOARCH} GOARM=${GOARM} go build -o anova4all ./cmd/anova4all

FROM gcr.io/distroless/static:nonroot as core
WORKDIR /
COPY --from=build-go /workspace/anova4all .
COPY --from=build-frontend /app/dist ./dist

ENV FRONTEND_DIST_DIR=dist/

ENTRYPOINT ["/anova4all"]