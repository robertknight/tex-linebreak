# Release process

1. Update CHANGELOG.md
2. Update the version number in `package.json`
3. Create and push a tag (`git tag vX.Y.Z`, `git push --tags`)
4. Run `yarn publish`
5. Create a new release on GitHub using the new tag. Use auto-generated release
   notes, but remove changes which do not affect consumers of the package.
