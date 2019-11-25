---
id: versioning-contribution
title: Versioning and Contribution Guide
---

## Versioning Guide

Cookie-Cutter maintains the following version tags.

-   `next` - the latest development version for new features and updates. Users using this version should expect it to be less stable than other versions.
-   `latest` - the current latest stable version. Support for this version will be limited to only bug fixes.
-   `snapshot` - for each commit to the repo that do not get merged into either `master` or develop branches we create a snapshot version that is a unique identifier formatted as `$version-$epoch-\$githash. We do not guarantee any support for snapshot versions.

Older versions are considered unsupported and will generally not receive any more updates (exceptions can be made on a case by case basis).

## Workflow for contributing to different version

### development

Work on the latest development tag resides on `develop` branch. Any new features and updates should be tracked against that branch's latest commit. Ensure that the package.json isn't updated unless it's to create a new release under the `next` tag. If you intend to create a new release under the `next` tag ensure that the version is suffixed by a `beta.$version` identifier (e.g. `1.1.0-beta.0`) to ensure that we can promote a beta version to stable in the future (e.g. `1.1.0`). This lets us avoid naming conflicts for the package when promoting. When creating a pull request ensure that you merge into `develop` and not the `master` branch since that's the default choice in the UI.

```
$ git fetch
$ git checkout -b development-task origin/develop
$ ### Do Work ###
$ ### Update package.json Version If Necessary ###
$ ### Commit and Push ###
$ ### Open PR Against `develop` ###
```

### latest

The stable branch resides in `master` and will get released under the `latest` tag. We should only ever make updates to the branch to include new bug fixes or promote work from a development release to stable.

An example bug fix workflow:

```
$ git fetch
$ git checkout tags/@walmartlabs/cookie-cutter@1.0.0 -b latest-bug-fix
$ ### Do Work ###
$ npm version patch
$ ### Commit and Push ###
$ ### Open PR Against `master` ###
```

When we merge a bug fix into master we'll also want to ensure that those code changes have also been propagated to the latest development branch so that we don't accidentally reintroduce bugs in future versions. Here's an example workflow for that:

```
$ git fetch
$ git checkout -b master-fix-into-develop origin/develop
$ git merge origin/master
$ ### Resolve any merge conflicts and Do Not Update package.json version ###
$ ### Commit and Push ###
$ ### Open PR Against `develop` branch ###
```

An example workflow to promote a development branch to stable:

```
$ git fetch
$ git checkout -b create-release origin/develop // development branch is at `1.0.0-beta.0`
$ ### Do Work ###
$ npm version 1.0.0
$ ### Commit and Push ###
$ ### Open PR Against `master` ###
```

### previous stable version bug fixes

We only maintain support for the latest version and previous latest version of Cookie-Cutter. The previous latest version could be a major or minor version depending on our release cycle. The previous latest version will only ever get bug fixes. Any bug fix work will always be done against the `prev` branch. This branch might not be available in the repository so it's up to the person creating it to make this new branch and then create a separate branch for the work to be done against it and merged into the `prev` branch.

An example bug fix workflow:

```
$ git fetch
$ git checkout -b prev tags/@walmartlabs/cookie-cutter@2.1.0 // Current latest is 3.1.0 and previous latest is 2.1.0
$ ### push prev branch.
$ ### enable appropriate branch policies on `prev` branch and ensure we have CI enabled for PRs opened against it
$ git branch -m prev-branch-fix
$ ### Do Work ###
$ npm version patch
$ ### Commit and Push ###
$ ### Open PR Against `prev` ###
```

### Best practices

-   Ensure that PRs are marked to squash merge so that we retain a single clean git commit history. Additional info on squash merging can be [found here](https://docs.microsoft.com/en-us/azure/devops/repos/git/merging-with-squash?view=azure-devops).
-   Check that you're always correctly merging into the appropriate branch for your work as it's easy to accidentally merge into `master`.
