use std::io::{self, BufRead, Write};
fn main() {
    let mode = std::env::args().nth(1).unwrap_or_default();
    for line in io::stdin().lock().lines() {
        let line = line.unwrap();
        let id = line.split("\"id\":").nth(1).unwrap().trim_start().chars().take_while(|c| c.is_ascii_digit()).collect::<String>();
        match mode.as_str() {
            "crash" => return,
            "invalid" => println!("not json"),
            "large" => println!("{}", "x".repeat(1024 * 1024 + 1)),
            "stall" => std::thread::sleep(std::time::Duration::from_secs(60)),
            _ => {
                println!("{{\"id\":{id},\"type\":\"status\",\"status\":\"loading\"}}");
                println!("{{\"id\":{id},\"type\":\"result\",\"result\":{{\"ready\":true}}}}");
            }
        }
        io::stdout().flush().unwrap();
    }
}
