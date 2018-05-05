declare global {
  interface Range {
    intersectsNode(node: Node): boolean;
  }
}

/**
 * Return a list of `Text` nodes in `range`.
 *
 * `filter` is called with each node in document order in the subtree rooted
 * at `range.commonAncestorContainer`. If it returns false, that node and its
 * children are skipped.
 */
export function textNodesInRange(range: Range, filter: (n: Node) => boolean) {
  const root = range.commonAncestorContainer;
  const nodeIter = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_ALL, {
      acceptNode(node: Node) {
        if (filter(node)) {
          return NodeFilter.FILTER_ACCEPT;
        } else {
          return NodeFilter.FILTER_REJECT;
        }
      },
    },
    false /* expandEntityReferences */,
  );

  let currentNode: Node|null = nodeIter.currentNode;
  let foundStart = false;
  let nodes: Text[] = [];

  while (currentNode) {
    if (range.intersectsNode(currentNode) && currentNode instanceof Text) {
      nodes.push(currentNode);
    }
    currentNode = nodeIter.nextNode();
  }
  return nodes;
}
