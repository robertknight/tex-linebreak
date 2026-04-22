# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2026-04-22

 - Improve breakpoint selection when items have negative width (thanks @basil) -
   https://github.com/robertknight/tex-linebreak/pull/122. See also
   https://basilcrow.com/blog/relaxing-knuths-restrictions/.

 - Fix penalty item widths being double-counted when a line break occurs at
   a penalty item with a width (thanks @basil) -
   https://github.com/robertknight/tex-linebreak/pull/121

 - Fix valid breakpoints being missed when a line's actual length and ideal
   length are exactly equal and glue has zero stretch / shrink (thanks @basil) -
   https://github.com/robertknight/tex-linebreak/pull/120

 - Require a terminal forced break in `breakLines` function (thanks @basil) -
   https://github.com/robertknight/tex-linebreak/pull/119

 - Improve line breaking when `adjacentLooseTightPenalty` is used
   (thanks @basil) - https://github.com/robertknight/tex-linebreak/pull/118

## [0.8.1] - 2025-08-04

 - Limit an optimization to only apply when no items have negative widths,
   shrink or stretch (thanks @basil) -
   https://github.com/robertknight/tex-linebreak/pull/105

## [0.8.0] - 2025-08-02

 - Support negative widths and stretchability/shrinkability (thanks @basil) -
   https://github.com/robertknight/tex-linebreak/pull/103

## [0.7.0] - 2024-01-15

 - Add built-in type declarations (thanks @w8r) -
   https://github.com/robertknight/tex-linebreak/pull/74

## [0.6.0] - 2021-12-28

The package's code has been converted to ES 2017+. As such it no longer supports
IE 11 or other pre-2017 browsers.
