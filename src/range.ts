function isNodeInRange(range: Range, node: Node) {
  if (node === range.startContainer || node === range.endContainer) {
    return true;
  }

  const nodeRange = node.ownerDocument.createRange();
  nodeRange.selectNode(node);
  const isAtOrBeforeStart = range.compareBoundaryPoints(Range.START_TO_START, nodeRange) <= 0;
  const isAtOrAfterEnd = range.compareBoundaryPoints(Range.END_TO_END, nodeRange) >= 0;
  nodeRange.detach();
  return isAtOrBeforeStart && isAtOrAfterEnd;
}

function forEachNodeInRange(r: Range, callback: (n: Node) => any) {
  const root = r.commonAncestorContainer;

  // The `whatToShow`, `filter` and `expandEntityReferences` arguments are
  // mandatory in IE although optional according to the spec.
  const nodeIter = root.ownerDocument.createNodeIterator(
    root,
    NodeFilter.SHOW_ALL,
    undefined /* filter */,
    false /* expandEntityReferences */,
  );

  let currentNode;
  while ((currentNode = nodeIter.nextNode())) {
    if (isNodeInRange(r, currentNode)) {
      callback(currentNode);
    }
  }
}

export function textNodesInRange(range: Range) {
  const textNodes: Text[] = [];
  forEachNodeInRange(range, node => {
    if (node.nodeType === Node.TEXT_NODE) {
      textNodes.push(node as Text);
    }
  });

  return textNodes.filter(node => {
    const nodeRange = node.ownerDocument.createRange();
    nodeRange.selectNodeContents(node);
    if (node === range.startContainer) {
      nodeRange.setStart(node, range.startOffset);
    }
    if (node === range.endContainer) {
      nodeRange.setEnd(node, range.endOffset);
    }
    if (nodeRange.collapsed) {
      // If the range ends at the start of this text node or starts at the end
      // of this node then do not include it.
      return false;
    }
    return true;
  });
}
