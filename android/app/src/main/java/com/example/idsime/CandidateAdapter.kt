package com.example.idsime

import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

class CandidateAdapter(
    private val onPick: (String) -> Unit,
) : RecyclerView.Adapter<CandidateAdapter.VH>() {

    private val items = mutableListOf<String>()

    fun submit(list: List<String>) {
        Log.i("CandAdapter", "submit size=${list.size} sample=${list.take(5)}")
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    override fun onAttachedToRecyclerView(rv: RecyclerView) {
        super.onAttachedToRecyclerView(rv)
        Log.i("CandAdapter", "onAttached rv w=${rv.width} h=${rv.height} vis=${rv.visibility}")
    }

    fun top(): String? = items.firstOrNull()

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.candidate_item, parent, false)
        val vh = VH(v)
        // Force the bundled IPAmj Mincho so rare kanji render with a consistent,
        // wide-coverage glyph set rather than whatever vendor font ships on the device.
        ImeFonts.cjk(parent.context)?.let { vh.glyph.typeface = it }
        return vh
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val ucs = items[position]
        holder.glyph.text = ucs
        holder.itemView.setOnClickListener { onPick(ucs) }
    }

    override fun getItemCount(): Int = items.size

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val glyph: TextView = v.findViewById(R.id.glyph)
    }
}
