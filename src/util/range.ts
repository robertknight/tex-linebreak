export function textNodesInRange(range: Range) {
  const root = range.commonAncestorContainer;
  const nodeIter = root.ownerDocument.createNodeIterator(
    root,
    NodeFilter.SHOW_ALL,
    undefined /* filter */,
    false /* expandEntityReferences */,
  );

  let currentNode;
  let foundStart = false;
  let nodes: Text[] = [];
  while ((currentNode = nodeIter.nextNode())) {
    if (!foundStart) {
      if (currentNode !== range.startContainer) {
        continue;
      } else {
        foundStart = true;
      }
    }
    if (currentNode instanceof Text) {
      nodes.push(currentNode);
    }
    if (currentNode === range.endContainer) {
      break;
    }
  }
  return nodes;
}
