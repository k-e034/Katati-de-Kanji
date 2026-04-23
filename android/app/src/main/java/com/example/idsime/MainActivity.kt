package com.example.idsime

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        findViewById<Button>(R.id.btnImeSettings).setOnClickListener {
            startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
        }
        findViewById<Button>(R.id.btnPicker).setOnClickListener {
            val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showInputMethodPicker()
        }

        // Warm up the DB + reading index on a background thread so the first
        // keyboard invocation feels snappy.
        findViewById<TextView>(R.id.statusText).text = "読み込み中..."
        Thread {
            val t0 = System.currentTimeMillis()
            val search = IdsSearch.get(applicationContext)
            val elapsed = System.currentTimeMillis() - t0
            runOnUiThread {
                findViewById<TextView>(R.id.statusText).text =
                    "準備完了: 読み ${search.readingCount} 件 / ${elapsed}ms"
            }
        }.start()
    }
}
