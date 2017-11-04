#!/bin/bash

ns_url="${NIGHTSCOUT_HOST}"
ns_secret="${API_SECRET}"

# exit codes
# -1 ==> $1 file doesn't exist
# 0 ==> success
# other ==> curl_status

curl_status=-1

if [ -e $1 ]; then
  curl -f -m 30 -s -X POST -d @$1 \
  -H "API-SECRET: $ns_secret" \
  -H "Content-Type: application/json" \
  "${ns_url}/api/v1/entries.json"
  curl_status=$?
fi

exit $curl_status



