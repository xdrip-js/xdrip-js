#!/bin/bash
# requirements
#   bt-device --> bluez-tools
#      sudo apt-get install bluez-tools
#   xdrip-js
# 

cd /root/src/xdrip-js

echo "Starting xdrip-get-entries.sh" 
date

echo "Removing any existing Dexcom bluetooth connections" 
echo "Replace PQ with the last 2 digits of your Dexcom g5 device id"
bt-device -r DexcomPQ

if [ -e "./entry.json" ] ; then
  lastGlucose=$(cat ./entry.json | jq -M '.[0].unfiltered')
  lastUnfiltered=$(cat ./entry.json | jq -M '.[0].unfiltered')
  mv ./entry.json ./last-entry.json
fi

echo "Replace 405FPQ with your full 6 character Dexcom g5 device id"
transmitter="405FPQ"

echo "Calling xdrip-js ... node example $transmitter" 
timeout 360s node example $transmitter
#DEBUG=transmitter,bluetooth-manager node example 410BFE
echo "after xdrip-js bg record below ..."

cat ./entry.json
  
glucose=$(cat ./entry.json | jq -M '.[0].unfiltered')
echo 

if [ "${glucose}" == "" ] ; then
  echo "Invalid response from g5 transmitter"
  ls -al ./entry.json
  cat ./entry.json
  rm ./entry.json
else

  dg=`expr $glucose - $lastGlucose`

  # begin try out averaging last two entries ...
  da=${dg}
  if [ ${da} -lt 0 ]; then
    da=`expr 0 - $da`
  fi
  if [ ${da} -lt 45 -a ${da} -gt 6 ]; then
     echo "Before Average last 2 entries - lastGlucose=$lastGlucose, dg=$dg, glucose=${glucose}"
     glucose=`expr $glucose + $lastGlucose`
     glucose=`expr $glucose / 2`
     dg=`expr $glucose - $lastGlucose`
     echo "After Average last 2 entries - lastGlucose=$lastGlucose, dg=$dg, glucose=${glucose}"
  fi
  # end average last two entries if noise  code

  # log to csv file for research g5 outputs
  unfiltered=$(cat ./entry.json | jq -M '.[0].unfiltered')
  filtered=$(cat ./entry.json | jq -M '.[0].filtered')
  glucoseg5=$(cat ./entry.json | jq -M '.[0].glucose')
#  logdate=$(cat ./entry.json | jq -M '.[0].dateString')
  datetime=$(date +"%Y-%m-%d %H:%M")

  # end log to csv file logic for g5 outputs

  # begin calibration logic - look for calibration from NS, use existing calibration or none
  calibration=0
  ns_url="${NIGHTSCOUT_HOST}"
  METERBG_NS_RAW="meterbg_ns_raw.json"
  CALIBRATION_STORAGE="calibration.json"

  curl -m 30 "${ns_url}/api/v1/treatments.json?find\[created_at\]\[\$gte\]=$(date -d "7 minutes ago" -Iminutes -u)&find\[eventType\]\[\$regex\]=Check" 2>/dev/null > $METERBG_NS_RAW

  meterbg=$(cat $METERBG_NS_RAW | jq -M '.[0] | .glucose')
  meterbg="${meterbg%\"}"
  meterbg="${meterbg#\"}"

  if [ "$meterbg" == "null" ]; then
    :
  else
    if [ $meterbg -lt 400 -a $meterbg -gt 40 ]; then
      # valid calibration bg from NS, use average of current and last bg for calibration
      #if [ $lastGlucose -gt 35 ]; then # safety in case $lastGlucose is NULL or 0
      #  averagebg=`expr $unfiltered + $lastUnfiltered`
      #  averagebg=`expr $averagebg / 2`
      #else
      #  averagebg=$glucose
      #fi
     
      calibration=`expr $meterbg - $glucose`
      echo "calibration=$calibration, meterbg=$meterbg, glucose=$glucose"
      if [ $calibration -lt 30 -a $calibration -gt -40 ]; then
        # another safety check, but this is a good calibration
        echo "[{\"calibration\":${calibration}}]" > $CALIBRATION_STORAGE
        cp $METERBG_NS_RAW meterbg-ns-backup.json
      fi

    fi
  fi
      
  if [ -e $CALIBRATION_STORAGE ]; then
    calibration=$(cat $CALIBRATION_STORAGE | jq -M '.[0] | .calibration')
    calibratedglucose=`expr $glucose + $calibration`
    echo "After calibration calibratedglucose =$calibratedglucose"
  fi
 
   cp entry.json entry-before-calibration.json

   tmp=$(mktemp)
   jq ".[0].glucose = $calibratedglucose" entry.json > "$tmp" && mv "$tmp" entry.json 

   tmp=$(mktemp)
   jq ".[0].sgv = $calibratedglucose" entry.json > "$tmp" && mv "$tmp" entry.json 

   tmp=$(mktemp)
   jq ".[0].device = \"${transmitter}\"" entry.json > "$tmp" && mv "$tmp" entry.json 
  # end calibration logic

  direction='NONE'
  echo "Valid response from g5 transmitter"

  if [ ${dg} -lt -10 ]; then
     direction='DoubleDown'
  elif [ ${dg} -lt -7 ]; then
     direction='SingleDown'
  elif [ ${dg} -lt -3 ]; then
     direction='FortyFiveDown'
  elif [ ${dg} -lt 3 ]; then
     direction='Flat'
  elif [ ${dg} -lt 7 ]; then
     direction='FortyFiveUp'
  elif [ ${dg} -lt 10 ]; then
     direction='SingleUp'
  elif [ ${dg} -lt 50 ]; then
     direction='DoubleUp'
  fi

  echo "Gluc=${glucose}, last=${lastGlucose}, diff=${dg}, dir=${direction}"

  cat entry.json | jq ".[0].direction = \"$direction\"" > entry-xdrip.json

  if [ ! -f "/var/log/openaps/g5.csv" ]; then
    echo "datetime,unfiltered,filtered,glucoseg5,glucose,calibratedglucose,direction,calibration" > /var/log/openaps/g5.csv
  fi

  echo "${datetime},${unfiltered},${filtered},${glucoseg5},${glucose},${calibratedglucose},${direction},${calibration}" >> /var/log/openaps/g5.csv

  echo "Posting glucose record to xdripAPS"
  ./post-xdripAPS.sh ./entry-xdrip.json
  #ls -al ./entry-xdrip.json
  #cat ./entry-xdrip.json

  if [ -e "./entry-backfill.json" ] ; then
    # In this case backfill records not yet sent to Nightscout
      
    jq -s add ./entry-xdrip.json ./entry-backfill.json > ./entry-ns.json
    cp ./entry-ns.json ./entry-backfill.json
    echo "entry-backfill.json exists, so setting up for backfill"
  else
    echo "entry-backfill.json does not exist so no backfill"
    cp ./entry-xdrip.json ./entry-ns.json
  fi

  echo "Posting blood glucose record(s) to NightScout"
  ./post-ns.sh ./entry-ns.json
  echo
  if [ 0 -eq $? ] ; then
    # success
    echo "Upload to NightScout of xdrip entry worked."
    echo "Removing ./entry-backfill.json"
    rm ./entry-backfill.json
  else
    echo
    echo "Upload to NightScout of xdrip entry did not work."
    echo "                saving for upload for when network is restored"
    cp ./entry-ns.json ./entry-backfill.json
  fi
fi  

echo "Finished xdrip-get-entries.sh"
date
echo

