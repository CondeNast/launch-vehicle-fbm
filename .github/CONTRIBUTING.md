# Contributing

We love contributions! This document helps you figure out how to do that. Before we start, we want to address one question:

> Is this an open source project or a project that is open source?

We're actively using this project inside Condé Nast and have requirements that are internal to our company. We think this is useful to other folks and want to make it available to everyone. We hope you find it useful and find ways to make it even more useful. If you do, please follow the guidelines in this document and open a pull request with your changes. That said, we might not except _every_ pull request if it moves the package in a way that doesn't mesh with our plans.

The rest of this document outlines the guidelines for getting contributions accepted faster. Here are the others:

## Know each file in the root of the project

In addition to `package.json`, these files will save you from configuration
headaches:

* `.nvmrc` What version of Node to use
* `example.env` Environment variables you should have set

## Submitter closes their own pull request

You are the best judge for when your PR is ready for merging. After it's
approved, it's your job to merge it if you're one of the maintainers.

EXCEPTION: it may get merged if your PR is blocking someone else.

## Use squash and merge

We use small PRs along with [squash and merge] to keep the git history cleaner.
Copy paste the description into the commit message before merging. Afterwards,
delete your branch.

EXCEPTION: Use merge commits if you crafted a commit designed to be reverted.

## Remember the PR title becomes the Git commit subject line

Craft your PR title to say **why** you're doing the change, not what it's
doing. The what is already obvious from the diff. The why may already be
explained in the description, but not in a concise way like the title.

## Update requirements every pull request

Rather than make a separate pull request for [greenkeeper]-like updates,
non-breaking updates can be done in any PR. This will help keep the project
from rotting. [npm-check] is a good tool to use for this.

EXCEPTION: If an update breaks things, do it in it's own PR.

## Any questions? Made a mistake?

![](http://media.gq.com/photos/5813a1d6a5c7fc2f0941163e/master/w_640/SNL_pumpkins-640x356.jpg)

Then we need to update this document! Ask away.

[squash and merge]: https://github.com/blog/2141-squash-your-commits
[greenkeeper]: https://greenkeeper.io/#how-it-works
[npm-check]: https://github.com/dylang/npm-check
