// ponytail: PiaScript recursive descent parser handles single expressions and basic if-blocks.
// Upgrade path: full AST compiler with bytecode VM if user scripts require arbitrary loops or user-defined functions.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PiaCandle {
    pub timestamp: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PiaPlot {
    pub title: String,
    pub color: String,
    pub values: Vec<Option<f64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PiaSignal {
    pub index: usize,
    pub timestamp: i64,
    pub action: String,
    pub price: f64,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PiaTrade {
    pub entry_time: i64,
    pub exit_time: i64,
    pub action: String,
    pub entry_price: f64,
    pub exit_price: f64,
    pub pnl: f64,
    pub pnl_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PiaBacktestSummary {
    pub initial_capital: f64,
    pub final_equity: f64,
    pub net_profit: f64,
    pub net_profit_percent: f64,
    pub total_trades: usize,
    pub win_trades: usize,
    pub loss_trades: usize,
    pub win_rate: f64,
    pub profit_factor: f64,
    pub max_drawdown: f64,
    pub max_drawdown_percent: f64,
    pub trades: Vec<PiaTrade>,
    pub equity_curve: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PiaScriptResult {
    pub success: bool,
    pub error: Option<String>,
    pub plots: Vec<PiaPlot>,
    pub signals: Vec<PiaSignal>,
    pub backtest: Option<PiaBacktestSummary>,
}

#[derive(Clone, Debug)]
enum SeriesValue {
    NumSeries(Vec<f64>),
    BoolSeries(Vec<bool>),
}

pub struct PiaScriptEngine<'a> {
    candles: &'a [PiaCandle],
    variables: HashMap<String, SeriesValue>,
    plots: Vec<PiaPlot>,
    signals: Vec<PiaSignal>,
}

impl<'a> PiaScriptEngine<'a> {
    pub fn new(candles: &'a [PiaCandle]) -> Self {
        let n = candles.len();
        let mut variables = HashMap::new();
        let mut open = Vec::with_capacity(n);
        let mut high = Vec::with_capacity(n);
        let mut low = Vec::with_capacity(n);
        let mut close = Vec::with_capacity(n);
        let mut volume = Vec::with_capacity(n);
        let mut hl2 = Vec::with_capacity(n);
        let mut hlc3 = Vec::with_capacity(n);

        for c in candles {
            open.push(c.open);
            high.push(c.high);
            low.push(c.low);
            close.push(c.close);
            volume.push(c.volume.unwrap_or(0.0));
            hl2.push((c.high + c.low) / 2.0);
            hlc3.push((c.high + c.low + c.close) / 3.0);
        }

        variables.insert("open".to_string(), SeriesValue::NumSeries(open));
        variables.insert("high".to_string(), SeriesValue::NumSeries(high));
        variables.insert("low".to_string(), SeriesValue::NumSeries(low));
        variables.insert("close".to_string(), SeriesValue::NumSeries(close));
        variables.insert("volume".to_string(), SeriesValue::NumSeries(volume));
        variables.insert("hl2".to_string(), SeriesValue::NumSeries(hl2));
        variables.insert("hlc3".to_string(), SeriesValue::NumSeries(hlc3));

        Self {
            candles,
            variables,
            plots: Vec::new(),
            signals: Vec::new(),
        }
    }

    pub fn execute(&mut self, script: &str, initial_capital: Option<f64>) -> PiaScriptResult {
        if self.candles.is_empty() {
            return PiaScriptResult {
                success: false,
                error: Some("No candle data available to execute script".to_string()),
                plots: Vec::new(),
                signals: Vec::new(),
                backtest: None,
            };
        }

        let lines: Vec<&str> = script.lines().collect();
        let mut i = 0;

        while i < lines.len() {
            let raw_line = lines[i];
            let clean = clean_line(raw_line);
            if clean.is_empty() {
                i += 1;
                continue;
            }

            if clean.starts_with("if ") {
                let base_indent = get_indent(raw_line);
                // If statement: e.g. "if crossover(fast, slow):"
                let cond_str = clean[3..].trim().trim_end_matches(':').trim();
                let cond_eval = match self.eval_bool_expr(cond_str) {
                    Ok(b) => b,
                    Err(e) => {
                        return PiaScriptResult {
                            success: false,
                            error: Some(format!("Line {}: {}", i + 1, e)),
                            plots: Vec::new(),
                            signals: Vec::new(),
                            backtest: None,
                        }
                    }
                };

                // Gather indented child lines
                let mut body_lines = Vec::new();
                i += 1;
                while i < lines.len() {
                    let next_line = lines[i];
                    let next_clean = clean_line(next_line);
                    if next_clean.is_empty() {
                        i += 1;
                        continue;
                    }
                    if get_indent(next_line) > base_indent {
                        body_lines.push(next_clean);
                        i += 1;
                    } else {
                        break;
                    }
                }

                for body in body_lines {
                    if let Err(e) = self.execute_conditional_action(&body, &cond_eval) {
                        return PiaScriptResult {
                            success: false,
                            error: Some(format!("Inside if-block: {}", e)),
                            plots: Vec::new(),
                            signals: Vec::new(),
                            backtest: None,
                        };
                    }
                }
                continue;
            }

            // Normal statement (assignment, plot, action)
            if let Err(e) = self.execute_statement(clean) {
                return PiaScriptResult {
                    success: false,
                    error: Some(format!("Line {}: {}", i + 1, e)),
                    plots: Vec::new(),
                    signals: Vec::new(),
                    backtest: None,
                };
            }
            i += 1;
        }

        // Run backtest simulation based on collected signals
        let backtest = self.run_backtest(initial_capital.unwrap_or(10_000.0));

        PiaScriptResult {
            success: true,
            error: None,
            plots: self.plots.clone(),
            signals: self.signals.clone(),
            backtest: Some(backtest),
        }
    }

    fn execute_statement(&mut self, line: &str) -> Result<(), String> {
        if line.starts_with("plot(") && line.ends_with(')') {
            return self.handle_plot(line);
        }

        if let Some((var_name, expr_str)) = line.split_once('=') {
            let var = var_name.trim();
            if var.is_empty() {
                return Err("Missing variable name".to_string());
            }
            let val = self.eval_expr(expr_str.trim())?;
            self.variables.insert(var.to_string(), val);
            return Ok(());
        }

        // Direct action without if (e.g. buy())
        if line.starts_with("buy") || line.starts_with("sell") || line.starts_with("close") {
            let n = self.candles.len();
            let all_true = vec![true; n];
            return self.execute_conditional_action(line, &all_true);
        }

        Err(format!("Unrecognized statement: '{}'", line))
    }

    fn handle_plot(&mut self, line: &str) -> Result<(), String> {
        let inner = &line[5..line.len() - 1].trim();
        let args = split_arguments(inner);
        if args.is_empty() {
            return Err("plot() requires an expression".to_string());
        }

        let series = match self.eval_expr(&args[0])? {
            SeriesValue::NumSeries(s) => s,
            SeriesValue::BoolSeries(b) => b.into_iter().map(|v| if v { 1.0 } else { 0.0 }).collect(),
        };

        let mut color = "#2962ff".to_string();
        let mut title = args[0].clone();

        for arg in &args[1..] {
            if let Some((k, v)) = arg.split_once('=') {
                let key = k.trim();
                let val = v.trim().trim_matches('"').trim_matches('\'');
                match key {
                    "color" => color = val.to_string(),
                    "title" => title = val.to_string(),
                    _ => {}
                }
            }
        }

        let values = series.into_iter().map(|v| if v.is_nan() { None } else { Some(v) }).collect();
        self.plots.push(PiaPlot { title, color, values });
        Ok(())
    }

    fn execute_conditional_action(&mut self, action_line: &str, cond: &[bool]) -> Result<(), String> {
        let clean = action_line.trim();
        let lower = clean.to_lowercase();
        let action = if lower.starts_with("buy") || lower.contains("strategy.long") || lower.contains("\"buy\"") || lower.contains("'buy'") {
            "BUY"
        } else if lower.starts_with("sell") || lower.contains("strategy.short") || lower.contains("\"sell\"") || lower.contains("'sell'") {
            "SELL"
        } else if lower.starts_with("close") || lower.contains("strategy.close") || lower.contains("\"close\"") || lower.contains("'close'") {
            "CLOSE"
        } else {
            return Err(format!("Unknown action in condition: {}", clean));
        };

        for (idx, &is_triggered) in cond.iter().enumerate() {
            if is_triggered && idx < self.candles.len() {
                self.signals.push(PiaSignal {
                    index: idx,
                    timestamp: self.candles[idx].timestamp,
                    action: action.to_string(),
                    price: self.candles[idx].close,
                    comment: Some(format!("Signal at Bar {}", idx)),
                });
            }
        }
        Ok(())
    }

    fn eval_bool_expr(&self, expr: &str) -> Result<Vec<bool>, String> {
        match self.eval_expr(expr)? {
            SeriesValue::BoolSeries(b) => Ok(b),
            SeriesValue::NumSeries(n) => Ok(n.into_iter().map(|v| v != 0.0 && !v.is_nan()).collect()),
        }
    }

    fn eval_expr(&self, expr: &str) -> Result<SeriesValue, String> {
        let expr = expr.trim();
        let n = self.candles.len();

        // Logical operators: or, and
        if let Some((left, right)) = split_binary_op(expr, " or ") {
            let l = self.eval_bool_expr(left)?;
            let r = self.eval_bool_expr(right)?;
            let res = l.iter().zip(r.iter()).map(|(&a, &b)| a || b).collect();
            return Ok(SeriesValue::BoolSeries(res));
        }

        if let Some((left, right)) = split_binary_op(expr, " and ") {
            let l = self.eval_bool_expr(left)?;
            let r = self.eval_bool_expr(right)?;
            let res = l.iter().zip(r.iter()).map(|(&a, &b)| a && b).collect();
            return Ok(SeriesValue::BoolSeries(res));
        }

        // Comparisons: >=, <=, ==, !=, >, <
        for op in &[">=", "<=", "==", "!=", ">", "<"] {
            if let Some((left, right)) = split_comparison(expr, op) {
                let l_series = self.eval_num_series(left)?;
                let r_series = self.eval_num_series(right)?;
                let mut res = Vec::with_capacity(n);
                for (&a, &b) in l_series.iter().zip(r_series.iter()) {
                    let matched = match *op {
                        ">=" => a >= b,
                        "<=" => a <= b,
                        "==" => (a - b).abs() < f64::EPSILON,
                        "!=" => (a - b).abs() >= f64::EPSILON,
                        ">" => a > b,
                        "<" => a < b,
                        _ => false,
                    };
                    res.push(matched);
                }
                return Ok(SeriesValue::BoolSeries(res));
            }
        }

        // Arithmetic: +, -
        if let Some((left, right, is_sub)) = split_add_sub(expr) {
            let l_series = self.eval_num_series(left)?;
            let r_series = self.eval_num_series(right)?;
            let res = l_series
                .iter()
                .zip(r_series.iter())
                .map(|(&a, &b)| if is_sub { a - b } else { a + b })
                .collect();
            return Ok(SeriesValue::NumSeries(res));
        }

        // Arithmetic: *, /
        if let Some((left, right, is_div)) = split_mul_div(expr) {
            let l_series = self.eval_num_series(left)?;
            let r_series = self.eval_num_series(right)?;
            let res = l_series
                .iter()
                .zip(r_series.iter())
                .map(|(&a, &b)| if is_div { if b == 0.0 { f64::NAN } else { a / b } } else { a * b })
                .collect();
            return Ok(SeriesValue::NumSeries(res));
        }

        // Builtin functions: ema, sma, rsi, crossover, crossunder, highest, lowest
        if let Some((func, args_str)) = split_func_call(expr) {
            let args = split_arguments(&args_str);
            match func.as_str() {
                "crossover" | "ta.crossover" => {
                    if args.len() < 2 {
                        return Err("crossover(a, b) requires 2 arguments".to_string());
                    }
                    let a = self.eval_num_series(&args[0])?;
                    let b = self.eval_num_series(&args[1])?;
                    let mut res = vec![false; n];
                    for k in 1..n {
                        if a[k] > b[k] && a[k - 1] <= b[k - 1] {
                            res[k] = true;
                        }
                    }
                    return Ok(SeriesValue::BoolSeries(res));
                }
                "crossunder" | "ta.crossunder" => {
                    if args.len() < 2 {
                        return Err("crossunder(a, b) requires 2 arguments".to_string());
                    }
                    let a = self.eval_num_series(&args[0])?;
                    let b = self.eval_num_series(&args[1])?;
                    let mut res = vec![false; n];
                    for k in 1..n {
                        if a[k] < b[k] && a[k - 1] >= b[k - 1] {
                            res[k] = true;
                        }
                    }
                    return Ok(SeriesValue::BoolSeries(res));
                }
                "sma" | "ta.sma" => {
                    let src = self.eval_num_series(args.get(0).ok_or("sma() requires source")?)?;
                    let period = args.get(1).and_then(|p| p.parse::<usize>().ok()).unwrap_or(14);
                    return Ok(SeriesValue::NumSeries(calc_sma(&src, period)));
                }
                "ema" | "ta.ema" => {
                    let src = self.eval_num_series(args.get(0).ok_or("ema() requires source")?)?;
                    let period = args.get(1).and_then(|p| p.parse::<usize>().ok()).unwrap_or(14);
                    return Ok(SeriesValue::NumSeries(calc_ema(&src, period)));
                }
                "rsi" | "ta.rsi" => {
                    let src = self.eval_num_series(args.get(0).ok_or("rsi() requires source")?)?;
                    let period = args.get(1).and_then(|p| p.parse::<usize>().ok()).unwrap_or(14);
                    return Ok(SeriesValue::NumSeries(calc_rsi(&src, period)));
                }
                "highest" | "ta.highest" => {
                    let src = self.eval_num_series(args.get(0).ok_or("highest() requires source")?)?;
                    let period = args.get(1).and_then(|p| p.parse::<usize>().ok()).unwrap_or(14);
                    return Ok(SeriesValue::NumSeries(calc_highest(&src, period)));
                }
                "lowest" | "ta.lowest" => {
                    let src = self.eval_num_series(args.get(0).ok_or("lowest() requires source")?)?;
                    let period = args.get(1).and_then(|p| p.parse::<usize>().ok()).unwrap_or(14);
                    return Ok(SeriesValue::NumSeries(calc_lowest(&src, period)));
                }
                _ => return Err(format!("Unknown function: {}", func)),
            }
        }

        // Index access: e.g. close[1]
        if let Some((v, idx_str)) = expr.split_once('[') {
            if expr.ends_with(']') {
                let var = v.trim();
                let shift: usize = idx_str.trim_end_matches(']').trim().parse().map_err(|_| "Invalid index")?;
                let src = self.eval_num_series(var)?;
                let mut shifted = vec![f64::NAN; n];
                for k in shift..n {
                    shifted[k] = src[k - shift];
                }
                return Ok(SeriesValue::NumSeries(shifted));
            }
        }

        // Variable lookup
        if let Some(val) = self.variables.get(expr) {
            return Ok(val.clone());
        }

        // Scalar number literal
        if let Ok(num) = expr.parse::<f64>() {
            return Ok(SeriesValue::NumSeries(vec![num; n]));
        }

        Err(format!("Cannot evaluate expression: '{}'", expr))
    }

    fn eval_num_series(&self, expr: &str) -> Result<Vec<f64>, String> {
        match self.eval_expr(expr)? {
            SeriesValue::NumSeries(s) => Ok(s),
            SeriesValue::BoolSeries(b) => Ok(b.into_iter().map(|v| if v { 1.0 } else { 0.0 }).collect()),
        }
    }

    fn run_backtest(&self, initial_capital: f64) -> PiaBacktestSummary {
        let n = self.candles.len();
        if n == 0 || self.signals.is_empty() {
            return PiaBacktestSummary {
                initial_capital,
                final_equity: initial_capital,
                net_profit: 0.0,
                net_profit_percent: 0.0,
                total_trades: 0,
                win_trades: 0,
                loss_trades: 0,
                win_rate: 0.0,
                profit_factor: 1.0,
                max_drawdown: 0.0,
                max_drawdown_percent: 0.0,
                trades: Vec::new(),
                equity_curve: vec![initial_capital; n],
            };
        }

        // Sort signals by index
        let mut signals = self.signals.clone();
        signals.sort_by_key(|s| s.index);

        struct OpenPos {
            action: String,
            entry_price: f64,
            entry_time: i64,
        }

        let mut current_pos: Option<OpenPos> = None;
        let mut equity = initial_capital;
        let mut peak_equity = initial_capital;
        let mut max_dd = 0.0;
        let mut max_dd_pct = 0.0;
        let mut trades = Vec::new();
        let mut gross_profit = 0.0;
        let mut gross_loss = 0.0;
        let mut equity_curve = Vec::with_capacity(n);

        let mut sig_idx = 0;

        for bar_idx in 0..n {
            let candle = &self.candles[bar_idx];

            while sig_idx < signals.len() && signals[sig_idx].index == bar_idx {
                let sig = &signals[sig_idx];
                sig_idx += 1;

                if sig.action == "CLOSE" {
                    if let Some(pos) = current_pos.take() {
                        let (pnl, pnl_pct) = calc_trade_pnl(&pos.action, pos.entry_price, candle.close);
                        equity += pnl;
                        if pnl > 0.0 { gross_profit += pnl; } else { gross_loss += pnl.abs(); }
                        trades.push(PiaTrade {
                            entry_time: pos.entry_time,
                            exit_time: candle.timestamp,
                            action: pos.action,
                            entry_price: pos.entry_price,
                            exit_price: candle.close,
                            pnl,
                            pnl_percent: pnl_pct,
                        });
                    }
                } else if sig.action == "BUY" {
                    // If short open, close it first
                    if let Some(pos) = current_pos.take() {
                        if pos.action == "SELL" {
                            let (pnl, pnl_pct) = calc_trade_pnl(&pos.action, pos.entry_price, candle.close);
                            equity += pnl;
                            if pnl > 0.0 { gross_profit += pnl; } else { gross_loss += pnl.abs(); }
                            trades.push(PiaTrade {
                                entry_time: pos.entry_time,
                                exit_time: candle.timestamp,
                                action: pos.action,
                                entry_price: pos.entry_price,
                                exit_price: candle.close,
                                pnl,
                                pnl_percent: pnl_pct,
                            });
                        } else {
                            current_pos = Some(pos); // keep existing long
                        }
                    }
                    if current_pos.is_none() {
                        current_pos = Some(OpenPos {
                            action: "BUY".to_string(),
                            entry_price: candle.close,
                            entry_time: candle.timestamp,
                        });
                    }
                } else if sig.action == "SELL" {
                    // If long open, close it first
                    if let Some(pos) = current_pos.take() {
                        if pos.action == "BUY" {
                            let (pnl, pnl_pct) = calc_trade_pnl(&pos.action, pos.entry_price, candle.close);
                            equity += pnl;
                            if pnl > 0.0 { gross_profit += pnl; } else { gross_loss += pnl.abs(); }
                            trades.push(PiaTrade {
                                entry_time: pos.entry_time,
                                exit_time: candle.timestamp,
                                action: pos.action,
                                entry_price: pos.entry_price,
                                exit_price: candle.close,
                                pnl,
                                pnl_percent: pnl_pct,
                            });
                        } else {
                            current_pos = Some(pos);
                        }
                    }
                    if current_pos.is_none() {
                        current_pos = Some(OpenPos {
                            action: "SELL".to_string(),
                            entry_price: candle.close,
                            entry_time: candle.timestamp,
                        });
                    }
                }
            }

            if equity > peak_equity {
                peak_equity = equity;
            }
            let dd = peak_equity - equity;
            let dd_pct = if peak_equity > 0.0 { (dd / peak_equity) * 100.0 } else { 0.0 };
            if dd > max_dd { max_dd = dd; }
            if dd_pct > max_dd_pct { max_dd_pct = dd_pct; }

            equity_curve.push(equity);
        }

        let total_trades = trades.len();
        let win_trades = trades.iter().filter(|t| t.pnl > 0.0).count();
        let loss_trades = trades.iter().filter(|t| t.pnl <= 0.0).count();
        let win_rate = if total_trades > 0 { (win_trades as f64 / total_trades as f64) * 100.0 } else { 0.0 };
        let profit_factor = if gross_loss > 0.0 { gross_profit / gross_loss } else if gross_profit > 0.0 { 99.9 } else { 1.0 };
        let net_profit = equity - initial_capital;
        let net_profit_percent = if initial_capital > 0.0 { (net_profit / initial_capital) * 100.0 } else { 0.0 };

        PiaBacktestSummary {
            initial_capital,
            final_equity: equity,
            net_profit,
            net_profit_percent,
            total_trades,
            win_trades,
            loss_trades,
            win_rate,
            profit_factor,
            max_drawdown: max_dd,
            max_drawdown_percent: max_dd_pct,
            trades,
            equity_curve,
        }
    }
}

fn calc_trade_pnl(action: &str, entry: f64, exit: f64) -> (f64, f64) {
    if entry <= 0.0 {
        return (0.0, 0.0);
    }
    // Using standard unit size 1.0
    if action == "BUY" {
        let pnl = exit - entry;
        let pct = (pnl / entry) * 100.0;
        (pnl, pct)
    } else {
        let pnl = entry - exit;
        let pct = (pnl / entry) * 100.0;
        (pnl, pct)
    }
}

// Technical indicator calculations (pure Rust, stdlib only)
fn calc_sma(src: &[f64], period: usize) -> Vec<f64> {
    let n = src.len();
    let mut out = vec![f64::NAN; n];
    if period == 0 || n < period {
        return out;
    }
    let mut sum = 0.0;
    for i in 0..period {
        sum += src[i];
    }
    out[period - 1] = sum / period as f64;
    for i in period..n {
        sum += src[i] - src[i - period];
        out[i] = sum / period as f64;
    }
    out
}

fn calc_ema(src: &[f64], period: usize) -> Vec<f64> {
    let n = src.len();
    let mut out = vec![f64::NAN; n];
    if period == 0 || n < period {
        return out;
    }
    let k = 2.0 / (period as f64 + 1.0);
    // Initial SMA
    let mut sum = 0.0;
    for i in 0..period {
        sum += src[i];
    }
    let mut prev = sum / period as f64;
    out[period - 1] = prev;

    for i in period..n {
        prev = (src[i] * k) + (prev * (1.0 - k));
        out[i] = prev;
    }
    out
}

fn calc_rsi(src: &[f64], period: usize) -> Vec<f64> {
    let n = src.len();
    let mut out = vec![f64::NAN; n];
    if period == 0 || n <= period {
        return out;
    }

    let mut gains = 0.0;
    let mut losses = 0.0;

    for i in 1..=period {
        let diff = src[i] - src[i - 1];
        if diff >= 0.0 { gains += diff; } else { losses += diff.abs(); }
    }

    let mut avg_gain = gains / period as f64;
    let mut avg_loss = losses / period as f64;

    if avg_loss == 0.0 {
        out[period] = 100.0;
    } else {
        let rs = avg_gain / avg_loss;
        out[period] = 100.0 - (100.0 / (1.0 + rs));
    }

    for i in (period + 1)..n {
        let diff = src[i] - src[i - 1];
        let gain = if diff > 0.0 { diff } else { 0.0 };
        let loss = if diff < 0.0 { diff.abs() } else { 0.0 };

        avg_gain = (avg_gain * (period as f64 - 1.0) + gain) / period as f64;
        avg_loss = (avg_loss * (period as f64 - 1.0) + loss) / period as f64;

        if avg_loss == 0.0 {
            out[i] = 100.0;
        } else {
            let rs = avg_gain / avg_loss;
            out[i] = 100.0 - (100.0 / (1.0 + rs));
        }
    }

    out
}

fn calc_highest(src: &[f64], period: usize) -> Vec<f64> {
    let n = src.len();
    let mut out = vec![f64::NAN; n];
    if period == 0 || n < period { return out; }
    for i in (period - 1)..n {
        let mut m = f64::NEG_INFINITY;
        for j in 0..period {
            let v = src[i - j];
            if v > m { m = v; }
        }
        out[i] = m;
    }
    out
}

fn calc_lowest(src: &[f64], period: usize) -> Vec<f64> {
    let n = src.len();
    let mut out = vec![f64::NAN; n];
    if period == 0 || n < period { return out; }
    for i in (period - 1)..n {
        let mut m = f64::INFINITY;
        for j in 0..period {
            let v = src[i - j];
            if v < m { m = v; }
        }
        out[i] = m;
    }
    out
}

// Parsing Helpers
fn get_indent(s: &str) -> usize {
    s.chars().take_while(|c| *c == ' ' || *c == '\t').count()
}

fn clean_line(s: &str) -> &str {
    let mut line = s;
    if let Some((clean, _)) = line.split_once('#') {
        line = clean;
    }
    if let Some((clean, _)) = line.split_once("//") {
        line = clean;
    }
    line.trim()
}

fn split_arguments(s: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut depth = 0;
    let mut in_quotes = false;

    for c in s.chars() {
        match c {
            '"' | '\'' => {
                in_quotes = !in_quotes;
                current.push(c);
            }
            '(' | '[' => {
                depth += 1;
                current.push(c);
            }
            ')' | ']' => {
                depth -= 1;
                current.push(c);
            }
            ',' if depth == 0 && !in_quotes => {
                args.push(current.trim().to_string());
                current.clear();
            }
            _ => current.push(c),
        }
    }
    if !current.trim().is_empty() {
        args.push(current.trim().to_string());
    }
    args
}

fn split_binary_op<'a>(s: &'a str, op: &str) -> Option<(&'a str, &'a str)> {
    s.split_once(op)
}

fn split_comparison<'a>(s: &'a str, op: &str) -> Option<(&'a str, &'a str)> {
    // Only match outside parentheses
    let mut depth = 0;
    let bytes = s.as_bytes();
    let op_bytes = op.as_bytes();

    for i in 0..bytes.len() {
        if bytes[i] == b'(' { depth += 1; }
        else if bytes[i] == b')' { depth -= 1; }
        else if depth == 0 && i + op_bytes.len() <= bytes.len() && &bytes[i..i + op_bytes.len()] == op_bytes {
            let left = std::str::from_utf8(&bytes[..i]).ok()?.trim();
            let right = std::str::from_utf8(&bytes[i + op_bytes.len()..]).ok()?.trim();
            return Some((left, right));
        }
    }
    None
}

fn split_add_sub<'a>(s: &'a str) -> Option<(&'a str, &'a str, bool)> {
    let mut depth = 0;
    let bytes = s.as_bytes();
    for i in (0..bytes.len()).rev() {
        if bytes[i] == b')' { depth += 1; }
        else if bytes[i] == b'(' { depth -= 1; }
        else if depth == 0 {
            if bytes[i] == b'+' {
                let left = std::str::from_utf8(&bytes[..i]).ok()?.trim();
                let right = std::str::from_utf8(&bytes[i + 1..]).ok()?.trim();
                return Some((left, right, false));
            } else if bytes[i] == b'-' && i > 0 && !b"+-*/,".contains(&bytes[i - 1]) {
                let left = std::str::from_utf8(&bytes[..i]).ok()?.trim();
                let right = std::str::from_utf8(&bytes[i + 1..]).ok()?.trim();
                return Some((left, right, true));
            }
        }
    }
    None
}

fn split_mul_div<'a>(s: &'a str) -> Option<(&'a str, &'a str, bool)> {
    let mut depth = 0;
    let bytes = s.as_bytes();
    for i in (0..bytes.len()).rev() {
        if bytes[i] == b')' { depth += 1; }
        else if bytes[i] == b'(' { depth -= 1; }
        else if depth == 0 {
            if bytes[i] == b'*' {
                let left = std::str::from_utf8(&bytes[..i]).ok()?.trim();
                let right = std::str::from_utf8(&bytes[i + 1..]).ok()?.trim();
                return Some((left, right, false));
            } else if bytes[i] == b'/' {
                let left = std::str::from_utf8(&bytes[..i]).ok()?.trim();
                let right = std::str::from_utf8(&bytes[i + 1..]).ok()?.trim();
                return Some((left, right, true));
            }
        }
    }
    None
}

fn split_func_call(s: &str) -> Option<(String, String)> {
    if let Some((func, rest)) = s.split_once('(') {
        if rest.ends_with(')') {
            let func_name = func.trim().to_string();
            let args_str = rest[..rest.len() - 1].trim().to_string();
            return Some((func_name, args_str));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_piascript_ema_cross_strategy() {
        let mut candles = Vec::new();
        // Generate 30 fake candles
        for i in 0..30 {
            let price = if i < 15 { 100.0 + i as f64 } else { 130.0 - i as f64 };
            candles.push(PiaCandle {
                timestamp: 1_700_000_000 + (i * 900),
                open: price,
                high: price + 1.0,
                low: price - 1.0,
                close: price,
                volume: Some(100.0),
            });
        }

        let script = r#"
            fast = ema(close, 5)
            slow = ema(close, 10)
            plot(fast, color="cyan", title="Fast EMA")
            plot(slow, color="orange", title="Slow EMA")

            if crossover(fast, slow):
                buy(1)

            if crossunder(fast, slow):
                close()
        "#;

        let mut engine = PiaScriptEngine::new(&candles);
        let res = engine.execute(script, Some(10_000.0));

        assert!(res.success, "Execution failed: {:?}", res.error);
        assert_eq!(res.plots.len(), 2, "Expected 2 plots");
        assert_eq!(res.plots[0].title, "Fast EMA");
        assert_eq!(res.plots[0].color, "cyan");
        assert!(res.backtest.is_some(), "Expected backtest result");

        let bt = res.backtest.unwrap();
        assert_eq!(bt.initial_capital, 10_000.0);
        assert!(!bt.equity_curve.is_empty());
    }
}
