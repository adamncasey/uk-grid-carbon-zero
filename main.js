import { RAW_ENERGY_DATA, RAW_ENERGY_HEADERS } from './bmrs.js'
import {RAW_SOLAR_DATA} from './solar.js'
import { DateTime } from './luxon.min.js';

const COLOURS = {
    "ccgt": "rgba(224, 159, 125, 1.0)",
    "oil": "rgba(0, 0, 0, 0.8)",
    "coal": "rgba(72, 67, 73, 1.0)",
    "nuclear": "rgba(0, 0, 120, 0.8)",
    "wind": "rgba(16, 150, 72, 1.0)",
    "pumped_storage": "rgba(0, 120, 255, 0.8)",
    "hydro": "rgba(146, 213, 230, 1.0)",
    "ocgt": "rgba(50, 0, 0, 0.8)",
    "other": "rgba(0, 0, 0, 0.1)",
    "intfr": "rgba(179, 112, 176, 1.0)",
    "intirl": "rgba(179, 112, 176, 1.0)",
    "inted": "rgba(179, 112, 176, 1.0)",
    "intew": "rgba(179, 112, 176, 1.0)",
    "intnem": "rgba(179, 112, 176, 1.0)",
    "intelec": "rgba(179, 112, 176, 1.0)",
    "intifa2": "rgba(179, 112, 176, 1.0)",
    "intnsl": "rgba(179, 112, 176, 1.0)",
    "solar": "rgba(249, 215, 28, 1.0)",
}

function daily_power_summary(data, h, output_data, options) {
    let seen_dates = {};
    let dates = [];
    let summary_data = {};
    for (let header in h) {
        summary_data[header] = [];
    }

    for (let datapoint of data) {
        let date = datapoint[0];

        if (!seen_dates.hasOwnProperty(date)) {
            seen_dates[date] = dates.length;
            dates.push(date);
        }

        let dateIndex = seen_dates[date];

        for (let header in h) {
            // aggregate into days. Sum MWh generated?
            let day = summary_data[header][dateIndex];

            if (!day) {
                day = 0;
            }

            let value = datapoint[h[header]] || 0;

            if (header == "solar") {
                value *= options.scale_solar;
            } else if (header == "wind") {
                value *= options.scale_wind;
            }

            day += value;

            summary_data[header][dateIndex] = day;
        }
    }

    for(let header in summary_data) {
        if (!output_data.hasOwnProperty(header)) {
            output_data[header] = [];
        }

        for(let date in summary_data[header]) {
            let y = summary_data[header][date] / 48; // 30min periods

            let yyyymmdd = dates[date];
            let x = new Date(Date.UTC(Math.floor(yyyymmdd / 10000), Math.floor(yyyymmdd % 10000 / 100) - 1, Math.floor(yyyymmdd % 100)));
            output_data[header][date] = {x, y};
        }
    }

    console.log(output_data);

    return output_data;
}

function combine_solar_and_bmrs(solar, bmrs_data, bmrs_headers) {
    for (let datapoint of solar) {
        // Parse time & convert to BST
        let datetime = DateTime.fromISO(datapoint[1]).setZone("Europe/London");

        // Convert to yyyymmdd + period
        let yyyymmdd = datetime.year * 10000 + datetime.month * 100 + datetime.day;
        let period = (datetime.hour * 2) + ((datetime.minute >= 30) ? 1 : 0);

        // Find bmrs_data entry for this time
        for (let bmrs_dp of bmrs_data) {
            if (bmrs_dp[0] == yyyymmdd && bmrs_dp[1] == period) {
                bmrs_dp.push(datapoint[3]);
            }
        }
    }

    console.log(bmrs_data);

    let headers = structuredClone(bmrs_headers);
    headers["solar"] = 20;

    return [bmrs_data, headers];
}

let combined_data = [];
let combined_headers = [];
let summary_data = {};

let chart_obj = null;

export function recalculate_data() {
    let options = {
        scale_solar: document.getElementById("scale_solar").value,
        scale_wind: document.getElementById("scale_wind").value,
    };

    daily_power_summary(combined_data, combined_headers, summary_data, options);

    if (chart_obj) chart_obj.update();
}

export function main() {
    let bmrs_data = RAW_ENERGY_DATA();
    let bmrs_headers = RAW_ENERGY_HEADERS();
    let solar = RAW_SOLAR_DATA();

    [combined_data, combined_headers] = combine_solar_and_bmrs(solar, bmrs_data, bmrs_headers);

    recalculate_data();

    const ctx = document.getElementById('myChart').getContext('2d');

    let datasets = [];
    for (let header in combined_headers) {
        datasets.push({
            label: header,
            data: summary_data[header],
            borderWidth: 1,
            borderColor: COLOURS[header],
            backgroundColor: COLOURS[header],
            fill: true,
        });
    }

    console.log(datasets);

    chart_obj = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: datasets,
        },
        options: {
            scales: {
                y: {
                    stacked: true,
                    title: {
                        text: "Energy Demand in MW"
                    }
                },
                x: {
                    type: 'time',
                    time: {
                        unit: 'month'
                    }
                }
            }
        }
    });

    document.getElementById("recalculate").onclick = () => recalculate_data();
}