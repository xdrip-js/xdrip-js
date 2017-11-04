#!/bin/bash
#
# exit codes
# -1 ==> $1 file doesn't exist
# 0 ==> success
# other ==> curl_status

ns_url="http://127.0.0.1:5000"
ns_secret="${API_SECRET}"

curl_status=-1

if [ -e $1 ]; then
  curl -f -m 30 -s -X POST -d @$1 \
  -H "API-SECRET: $ns_secret" \
  -H "Content-Type: application/json" \
  "${ns_url}/api/v1/entries"
  curl_status=$?
fi

#echo "in post xdrip entry: status=${curl_status} "

exit $curl_status
