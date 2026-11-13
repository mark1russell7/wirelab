# This script runs each repro of a review folder in its own process with a time limit of 90 s.
# Each argument is a script under repro/, with its arguments. The output has a header and the exit code for each script.
set +e
for item in "$@"; do
  read -r -a parts <<< "$item"
  echo "########## node repro/$item"
  timeout 90 node "repro/${parts[0]}" "${parts[@]:1}"
  echo "########## exit=$?"
  echo
done
