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

  let foundStart = false;
  let nodes: Text[] = [];
  while (nodeIter.currentNode) {
    if (!foundStart) {
      if (nodeIter.currentNode !== range.startContainer) {
        nodeIter.nextNode();
        continue;
      } else {
        foundStart = true;
      }
    }
    if (nodeIter.currentNode instanceof Text) {
      nodes.push(nodeIter.currentNode);
    }
    if (nodeIter.currentNode === range.endContainer) {
      break;
    }

    nodeIter.nextNode();
  }
  return nodes;
}
