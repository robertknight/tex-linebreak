# reflow

reflow is a web viewer for PDFs that makes it easier to read content on small
screens. It adapts the layout of pages to fit the device while preserving as
much of the original presentation as possible.

The core layout library can also be used to perform similar adaptation of
content for other software.

## Implementation

PDF documents consist of a set of pages, each of which consists of a set of
drawing commands (eg. draw a string at a specified position with a particular
font). This structure guarantees consistent presentation across different
viewers. However it means that the content formatted for printed pages or
laptop-sized screens cannot easily be adapted for smaller displays.

reflow adapts the document by processing the drawing commands for each page
to build up an understanding of the page's layout as a set of regions,
and then re-laying out the regions to fit the display.

### Layout process

When presenting a page, reflow performs the following steps to produce output
adapted for the size of display:

1. Get page drawing commands from document
2. Perform layout analysis to split content into regions
3. Classify regions as text (reflowable) or other (not reflowable)
4. Determine reading order of regions
5. Lay out boxes for regions to fit screen
6. Reflow or scale region contents to fit box.
   - For text regions, reflow using Knuth-Plass or similar
   - For other regions, scale to fit display. Some affordance can
     be provided in the UI to zoom.
