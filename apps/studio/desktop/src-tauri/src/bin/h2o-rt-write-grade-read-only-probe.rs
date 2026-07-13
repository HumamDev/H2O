use h2o_studio_desktop_lib::real_transport_capability_probe::h2o_rt_write_grade_read_only_probe;

fn main() {
    let result = h2o_rt_write_grade_read_only_probe().expect("write-grade read-only probe failed");
    println!(
        "{}",
        serde_json::to_string_pretty(&result).expect("write-grade read-only result serialization")
    );
}
