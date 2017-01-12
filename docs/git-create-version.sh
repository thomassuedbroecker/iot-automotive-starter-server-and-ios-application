#!/bin/bash
# Information steps:
# 1) chmod u+x git-create-version.sh
# 2) ./git-create-version.sh

echo "--> Create Version based on Tags in GIT"
cd ..
echo "List existing tags/versions:"
git tag

echo "Insert your version name:"
read version_name

echo "Insert version comment:"
read version_comment

git tag -a $version_name -m "$version_comment"

echo "Created version with using tags"
git show $version_name

echo "--> Version created GIT - Done!"
