package com.twolaugh.ex3cuusion.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// TS discriminated union on "type": { type: "none" } | { type: "daily" | "weekly"; ... }.
// kotlinx's default class discriminator is "type", so the wire format matches as-is. The TS
// daily/weekly variants share one object shape; they are split into two Kotlin classes purely
// because the discriminator value selects the class.
@Serializable
sealed interface RepeatPolicy {

    @Serializable
    @SerialName("none")
    data object None : RepeatPolicy

    @Serializable
    @SerialName("daily")
    data class Daily(
        val days: List<Int>? = null,
        val preferredWindow: PreferredWindow? = null,
        val carryover: Carryover,
        val cooldownDays: Int? = null
    ) : RepeatPolicy

    @Serializable
    @SerialName("weekly")
    data class Weekly(
        val days: List<Int>? = null,
        val preferredWindow: PreferredWindow? = null,
        val carryover: Carryover,
        val cooldownDays: Int? = null
    ) : RepeatPolicy
}
